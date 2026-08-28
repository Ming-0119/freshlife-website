/* FreshLife 官网交互验证脚本（第三轮，CDP over WebSocket，无外部依赖）
   用法: node scripts/verify-cdp.mjs <url> */
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = "/tmp/freshlife-cdp-profile";
const PORT = 9333;
const URL = process.argv[2] || "http://localhost:8099/";

import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  "--disable-background-networking", "--disable-crashpad",
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  "--window-size=1440,3400",
  "about:blank",
], { stdio: "ignore" });

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error("CDP endpoint not ready");
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (res.exceptionDetails) throw new Error("eval error: " + JSON.stringify(res.exceptionDetails.exception));
    return res.result.value;
  }
  close() { this.ws.close(); }
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const wsUrl = await getWsUrl();
const cdp = await CDP.connect(wsUrl);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 3400, deviceScaleFactor: 1, mobile: false });
await cdp.send("Page.navigate", { url: URL });
await sleep(2500);

// ---- 1. 主题：跟随系统 + 切换 + localStorage ----
const themeInfo = await cdp.eval(`(() => {
  const root = document.documentElement;
  return {
    attr: root.getAttribute("data-theme"),
    saved: localStorage.getItem("freshlife-theme"),
    buttons: document.querySelectorAll(".theme-toggle").length,
    hasToggle: !!document.getElementById("theme-toggle"),
    sysDark: matchMedia("(prefers-color-scheme: dark)").matches,
  };
})()`);
const expectedInitial = themeInfo.sysDark ? "dark" : "light";
check("主题按钮存在（导航栏）", themeInfo.hasToggle && themeInfo.buttons >= 1);
check("首次访问跟随系统", themeInfo.attr === expectedInitial && themeInfo.saved === null, `attr=${themeInfo.attr} sys=${themeInfo.sysDark}`);

await cdp.eval(`document.getElementById("theme-toggle").click()`);
await sleep(600);
const afterClick = await cdp.eval(`(() => ({
  attr: document.documentElement.getAttribute("data-theme"),
  saved: localStorage.getItem("freshlife-theme"),
  pressed: document.getElementById("theme-toggle").getAttribute("aria-pressed"),
  label: document.getElementById("theme-toggle").getAttribute("aria-label"),
}))()`);
const expectedAfter = expectedInitial === "dark" ? "light" : "dark";
check("点击切换按钮→相反主题", afterClick.attr === expectedAfter, `attr=${afterClick.attr}`);
check("偏好写入 localStorage", afterClick.saved === expectedAfter, `saved=${afterClick.saved}`);
check("aria-pressed / aria-label 更新", afterClick.pressed === String(expectedAfter === "dark") && afterClick.label.includes(expectedAfter === "dark" ? "日间" : "夜间"));

await cdp.eval(`document.getElementById("theme-toggle").click()`);
await sleep(600);
const backInitial = await cdp.eval(`document.documentElement.getAttribute("data-theme")`);
check("再点切回初始主题", backInitial === expectedInitial, `attr=${backInitial}`);

// 重载后仍记忆（localStorage 生效）
await cdp.send("Page.navigate", { url: URL });
await sleep(2000);
const reloaded = await cdp.eval(`document.documentElement.getAttribute("data-theme")`);
check("刷新后保持手动选择", reloaded === expectedInitial, `attr=${reloaded}`);

// ---- 2. 设备切换 ----
const devView = await cdp.eval(`(() => {
  const grid = document.querySelector("[data-device-grid]");
  const btns = [...document.querySelectorAll("[data-device-view]")];
  return { view: grid.getAttribute("data-view"), n: btns.length };
})()`);
check("设备切换按钮 3 个", devView.n === 3);
check("并排默认视图（桌面）", devView.view === "both", `view=${devView.view}`);

await cdp.eval(`document.querySelector('[data-device-view="ipad"]').click()`);
await sleep(300);
const ipadOnly = await cdp.eval(`(() => {
  const grid = document.querySelector("[data-device-grid]");
  const phone = document.querySelector('[data-device-col="phone"]');
  const pad = document.querySelector('[data-device-col="ipad"]');
  return { view: grid.getAttribute("data-view"), phoneHidden: getComputedStyle(phone).display === "none", padVisible: getComputedStyle(pad).display !== "none" };
})()`);
check("切到只看 iPad", ipadOnly.view === "ipad" && ipadOnly.phoneHidden && ipadOnly.padVisible);

// ---- 3. iPad 侧边栏 ----
await cdp.eval(`document.querySelector('[data-ipad-target="pantry"]').click()`);
await sleep(300);
const ipadSwitch = await cdp.eval(`(() => ({
  pantryActive: document.querySelector('[data-ipad-page="pantry"]').classList.contains("active"),
  todayHidden: !document.querySelector('[data-ipad-page="today"]').classList.contains("active"),
  pressed: document.querySelector('[data-ipad-target="pantry"]').getAttribute("aria-pressed"),
}))()`);
check("iPad 侧边栏切到库存", ipadSwitch.pantryActive && ipadSwitch.todayHidden && ipadSwitch.pressed === "true");

// 恢复并排视图，让手机演示可见（隐藏容器内 focus 无效）
await cdp.eval(`document.querySelector('[data-device-view="both"]').click()`);
await sleep(300);

// ---- 4. 手机 Tab 切换 + 键盘方向键 ----
await cdp.eval(`document.querySelector('[data-target="meals"]').click()`);
await sleep(300);
const tabSwitch = await cdp.eval(`(() => ({
  mealsActive: document.getElementById("mock-meals").classList.contains("active"),
  pointsUpdated: document.getElementById("tab-points").textContent.includes("餐食"),
}))()`);
check("iPhone 标签切到膳食", tabSwitch.mealsActive);
check("说明列表联动更新", tabSwitch.pointsUpdated);

// 键盘：焦点在 iPhone 底部标签，按 ArrowRight 应切换到下一个
await cdp.eval(`document.querySelector('.mock-tab[data-target="meals"]').focus()`);
await cdp.eval(`document.querySelector('.mock-tabbar').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))`);
await sleep(300);
const arrowTab = await cdp.eval(`(() => ({
  activeId: document.querySelector('.mock-tab[aria-selected="true"]')?.getAttribute("data-target"),
  exploreActive: document.getElementById("mock-explore").classList.contains("active"),
}))()`);
check("Tab 键盘方向键切换", arrowTab.activeId === "explore" && arrowTab.exploreActive, `active=${arrowTab.activeId}`);

// ---- 5. 移动导航 ----
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(600);
const mobileState = await cdp.eval(`(() => {
  const t = document.getElementById("nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  return {
    toggleVisible: getComputedStyle(t).display !== "none",
    navLinksHidden: getComputedStyle(navLinks).display === "none",
    themeBtnVisible: getComputedStyle(document.getElementById("theme-toggle")).display !== "none",
  };
})()`);
check("移动端汉堡按钮显示", mobileState.toggleVisible);
check("移动端桌面导航隐藏", mobileState.navLinksHidden);
check("移动端主题按钮仍可见", mobileState.themeBtnVisible);

await cdp.eval(`document.getElementById("nav-toggle").click()`);
await sleep(300);
const panelOpen = await cdp.eval(`document.getElementById("mobile-nav").classList.contains("open") && document.getElementById("nav-toggle").getAttribute("aria-expanded") === "true"`);
check("移动菜单打开", panelOpen);

// Escape 关闭并还焦
await cdp.eval(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
await sleep(300);
const panelClosed = await cdp.eval(`(() => ({
  closed: !document.getElementById("mobile-nav").classList.contains("open"),
  focusBack: document.activeElement === document.getElementById("nav-toggle"),
}))()`);
check("Escape 关闭移动菜单并还焦", panelClosed.closed && panelClosed.focusBack);

// 窄屏默认只看 iPhone
await cdp.eval(`document.querySelector('[data-device-view="both"]').click()`);
await sleep(200);
const narrowDefault = await cdp.eval(`document.querySelector("[data-device-grid]").getAttribute("data-view")`);
check("窄屏设备视图", narrowDefault === "phone" || narrowDefault === "both", `view=${narrowDefault}`);

// ---- 6. 滚动显现 ----
const reveals = await cdp.eval(`document.querySelectorAll(".reveal").length`);
const inView = await cdp.eval(`document.querySelectorAll(".reveal.in-view").length`);
check("reveal 元素存在", reveals > 0, `total=${reveals}`);
check("首屏 reveal 已显现", inView > 0, `inView=${inView}`);

// ---- 7. 链接自检 ----
const linkAudit = await cdp.eval(`(() => {
  const hrefs = [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href"));
  const broken = hrefs.filter(h => h.startsWith("#") && h.length > 1 && !document.getElementById(h.slice(1)));
  return { total: hrefs.length, broken };
})()`);
check("页内锚点全部有效", linkAudit.broken.length === 0, `broken=${JSON.stringify(linkAudit.broken)}`);

// ---- 8. 键盘焦点 ----
await cdp.eval(`document.querySelector("#theme-toggle").focus()`);
const focusVisible = await cdp.eval(`(() => {
  const el = document.getElementById("theme-toggle");
  return document.activeElement === el && !!getComputedStyle(el).outlineWidth && getComputedStyle(el).outlineWidth !== "0px";
})()`);
check("键盘焦点环可见", focusVisible);

// ---- 9. 对比度采样（当前主题） ----
await cdp.eval(`document.getElementById("theme-toggle").click()`);
await sleep(600);
const contrast = await cdp.eval(`(() => {
  const body = getComputedStyle(document.body);
  const ink2 = getComputedStyle(document.querySelector(".section-head .lead")).color;
  const bg = body.backgroundColor;
  return { ink2, bg };
})()`);
console.log("INFO  正文色/背景:", contrast.ink2, "on", contrast.bg);

console.log("\n===== 汇总 =====");
const failed = results.filter(r => !r.ok);
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
failed.forEach(f => console.log("  ✗", f.name, f.detail));
cdp.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
