/* FreshLife 全站视觉与布局验证（第三轮）
   覆盖：features 页、legal 页主题切换、404、320px 溢出、双主题对比度、
   iPad 并排布局、reduced-motion、敏感信息检查。
   用法: 先 make serve 或 python3 -m http.server 8099，再 node scripts/verify-layout.mjs */
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = "/tmp/freshlife-cdp-profile2";
const PORT = 9334;

import { spawn } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";

// 每次运行用干净的 profile，避免 localStorage 残留导致主题断言不确定
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  "--disable-background-networking", "--disable-crashpad",
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`,
  "--window-size=1440,3400", "about:blank",
], { stdio: "ignore" });

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error("CDP not ready");
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
        const p = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
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
    const res = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error("eval error: " + JSON.stringify(res.exceptionDetails.exception));
    return res.result.value;
  }
  close() { this.ws.close(); }
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const wsUrl = await getWsUrl();
const cdp = await CDP.connect(wsUrl);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

async function goto(url, w, h) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w <= 720 });
  await cdp.send("Page.navigate", { url });
  // 等待页面 DOM 就绪（主内容出现），避免冷启动/网络导致的固定延时不足
  for (let i = 0; i < 50; i++) {
    await sleep(120);
    let ready = false;
    try {
      ready = await cdp.eval(`document.readyState === "complete" && !!document.getElementById("main")`);
    } catch (e) { ready = false; }
    if (ready) break;
  }
}

// 将主题显式设为指定值（与系统主题无关，保证断言确定性）
async function setTheme(theme) {
  await cdp.eval(`(() => {
    let i = 0;
    while (document.documentElement.getAttribute("data-theme") !== "${theme}" && i < 4) {
      const t = document.getElementById("theme-toggle");
      if (!t) break;
      t.click();
      i++;
    }
  })()`);
  await sleep(400);
}

// ---- 隐私页主题 ----
await goto("http://localhost:8099/privacy/", 1440, 1200);
const legalTheme = await cdp.eval(`(() => {
  const t = document.getElementById("theme-toggle");
  return { has: !!t, count: document.querySelectorAll(".theme-toggle").length,
           attr: document.documentElement.getAttribute("data-theme"),
           saved: localStorage.getItem("freshlife-theme"),
           sysDark: matchMedia("(prefers-color-scheme: dark)").matches };
})()`);
check("隐私页有主题按钮", legalTheme.has && legalTheme.count === 1);
// 首次访问跟随系统（profile 可能残留历史偏好，遵循 localStorage 优先）
const expectedStart = (legalTheme.saved === "light" || legalTheme.saved === "dark")
  ? legalTheme.saved : (legalTheme.sysDark ? "dark" : "light");
const expectedAfter = expectedStart === "dark" ? "light" : "dark";

await cdp.eval(`document.getElementById("theme-toggle").click()`);
await sleep(500);
const legalLight = await cdp.eval(`document.documentElement.getAttribute("data-theme")`);
check("隐私页切换主题生效", legalLight === expectedAfter, `attr=${legalLight}`);
const legalSaved = await cdp.eval(`localStorage.getItem("freshlife-theme")`);
check("隐私页偏好全局记忆", legalSaved === expectedAfter);

// 回首页应保持该偏好
await goto("http://localhost:8099/", 1440, 3400);
const homeTheme = await cdp.eval(`document.documentElement.getAttribute("data-theme")`);
check("首页继承隐私页选择", homeTheme === expectedAfter);

// ---- 404 页（404.html 由托管平台对未匹配路径生效；本地直接加载验证内容） ----
await goto("http://localhost:8099/404.html", 1440, 1000);
const nf = await cdp.eval(`(() => ({
  hasHeader: !!document.querySelector(".site-header"),
  hasToggle: !!document.getElementById("theme-toggle"),
  code: document.querySelector(".notfound .code")?.textContent,
}))()`);
check("404 有页头与主题按钮", nf.hasHeader && nf.hasToggle);
check("404 文案渲染", nf.code === "404");

// ---- 320px 溢出检查（首页） ----
await goto("http://localhost:8099/", 320, 700);
const overflow320 = await cdp.eval(`(() => {
  const scrollW = document.documentElement.scrollWidth;
  const clientW = document.documentElement.clientWidth;
  const big = [...document.querySelectorAll("body *")].filter(el => {
    const r = el.getBoundingClientRect();
    return r.right > clientW + 1 && r.left < clientW && el.offsetParent !== null;
  }).slice(0, 5).map(el => el.className || el.tagName);
  return { scrollW, clientW, overflow: scrollW > clientW + 1, big };
})()`);
check("首页 320px 无横向溢出", !overflow320.overflow, `scrollW=${overflow320.scrollW} clientW=${overflow320.clientW} big=${JSON.stringify(overflow320.big)}`);
const ipad320 = await cdp.eval(`(() => {
  document.querySelector('[data-device-view="ipad"]').click();
  const pad = document.getElementById("ipad-device");
  const r = pad.getBoundingClientRect();
  return { w: Math.round(r.width), within: r.width <= 320 };
})()`);
check("320px 下 iPad 演示不超宽", ipad320.within, `width=${ipad320.w}px`);

// ---- 首屏与下一段的节奏：两个完整区块，禁止细竖线式伪分隔 ----
for (const [label, width, height] of [
  ["手机", 390, 844],
  ["iPad 竖屏", 768, 1024],
  ["iPad 横屏", 1024, 768],
  ["桌面", 1512, 949],
]) {
  await goto("http://localhost:8099/", width, height);
  const spacing = await cdp.eval(`(() => {
    const status = document.querySelector(".hero-status").getBoundingClientRect();
    const eyebrow = document.querySelector("#daily .eyebrow").getBoundingClientRect();
    const hero = document.querySelector(".hero").getBoundingClientRect();
    const daily = document.querySelector("#daily");
    const dailyRect = daily.getBoundingClientRect();
    const dailyStyle = getComputedStyle(daily);
    const bodyStyle = getComputedStyle(document.body);
    return {
      gap: Math.round(eyebrow.top - status.bottom),
      heroHeight: Math.round(hero.height),
      dailyTop: Math.round(dailyRect.top),
      viewportHeight: innerHeight,
      hasCue: !!document.querySelector(".hero-scroll-cue"),
      distinctSurface: dailyStyle.backgroundColor !== bodyStyle.backgroundColor,
      borderTop: parseFloat(dailyStyle.borderTopWidth),
    };
  })()`);
  check(`${label}首屏独占初始视口且与 Everyday 分区清晰`, !spacing.hasCue && spacing.distinctSurface && spacing.borderTop >= 1 && spacing.gap >= 80 && spacing.dailyTop >= spacing.viewportHeight - 1, JSON.stringify(spacing));
}

// ---- 完整功能页 /features/ ----
await goto("http://localhost:8099/features/", 1440, 3400);
const feat = await cdp.eval(`(() => {
  const sections = [...document.querySelectorAll(".fsec")].map(s => s.id);
  const indexLinks = [...document.querySelectorAll(".fpage-index a")].map(a => a.getAttribute("href"));
  const hasToggle = !!document.getElementById("theme-toggle");
  const badAnchor = indexLinks.filter(h => h.startsWith("#") && !document.getElementById(h.slice(1)));
  return { sections, indexLinks, hasToggle, badAnchor, nSections: sections.length };
})()`);
check("features 页七个功能分区", ["pantry", "add", "meals", "shopping", "devices", "privacy", "ai"].every(id => feat.sections.includes(id)) && feat.sections.includes("status"), feat.sections.join(","));
check("features 页目录锚点全部有效", feat.badAnchor.length === 0 && feat.indexLinks.length >= 7, JSON.stringify(feat.indexLinks));
check("features 页有主题按钮", feat.hasToggle);

await setTheme("dark");
const featDark = await cdp.eval(`document.documentElement.getAttribute("data-theme")`);
check("features 页切夜间生效", featDark === "dark");

// features 页 320px 溢出
await goto("http://localhost:8099/features/", 320, 700);
const featOverflow = await cdp.eval(`(() => {
  const scrollW = document.documentElement.scrollWidth;
  const clientW = document.documentElement.clientWidth;
  return { scrollW, clientW, overflow: scrollW > clientW + 1 };
})()`);
check("features 页 320px 无横向溢出", !featOverflow.overflow, `scrollW=${featOverflow.scrollW} clientW=${featOverflow.clientW}`);

// ---- 390px iPhone 尺寸 ----
await goto("http://localhost:8099/", 390, 844);
const iphone = await cdp.eval(`(() => {
  const phone = document.querySelector('[data-device-col="phone"] .phone');
  const pr = phone.getBoundingClientRect();
  document.querySelector('[data-device-view="ipad"]').click();
  const pad = document.getElementById("ipad-device").getBoundingClientRect();
  return { phoneW: Math.round(pr.width), padW: Math.round(pad.width), padWOver: pad.width > 390 };
})()`);
check("390px 下手机演示适配", iphone.phoneW <= 390, `phoneW=${iphone.phoneW}`);
check("390px 下 iPad 演示适配", !iphone.padWOver, `padW=${iphone.padW}`);

// ---- iPad / 横屏手机的中间宽度页头 ----
await goto("http://localhost:8099/", 820, 1180);
const ipadHeader = await cdp.eval(`(() => {
  const root = document.documentElement;
  const nav = document.querySelector(".nav-links");
  const toggle = document.getElementById("nav-toggle");
  const dailyLinks = [...document.querySelectorAll(".daily-card[href]")].map(a => a.getAttribute("href"));
  const heroPrimary = document.querySelector(".hero-actions .button.primary")?.getAttribute("href");
  return {
    overflow: root.scrollWidth > root.clientWidth + 1,
    navHidden: getComputedStyle(nav).display === "none",
    toggleVisible: getComputedStyle(toggle).display !== "none",
    dailyLinks,
    heroPrimary,
  };
})()`);
check("820px 页头切换为精简导航", ipadHeader.navHidden && ipadHeader.toggleVisible, JSON.stringify(ipadHeader));
check("820px 首页无横向溢出", !ipadHeader.overflow);
check("每日场景卡都有明确去向", JSON.stringify(ipadHeader.dailyLinks) === JSON.stringify(["#story-2", "#story-3", "#story-4"]), JSON.stringify(ipadHeader.dailyLinks));
check("首屏主按钮进入每日使用路径", ipadHeader.heroPrimary === "#daily", ipadHeader.heroPrimary);
const motionSetup = await cdp.eval(`(() => ({
  menuHidden: document.getElementById("mobile-nav").getAttribute("aria-hidden") === "true" && getComputedStyle(document.getElementById("mobile-nav")).visibility === "hidden",
  delays: [...document.querySelectorAll(".daily-card")].map(el => el.style.getPropertyValue("--reveal-delay")),
}))()`);
check("移动菜单关闭时不可交互", motionSetup.menuHidden);
check("同组场景卡按 55ms 轻微错峰", JSON.stringify(motionSetup.delays) === JSON.stringify(["0ms", "55ms", "110ms"]), JSON.stringify(motionSetup.delays));
await cdp.eval(`scrollTo(0, Math.round(innerHeight * 0.24))`);
await sleep(420);
const heroHandoff = await cdp.eval(`(() => ({
  progress: Number(getComputedStyle(document.documentElement).getPropertyValue("--hero-progress") || 0),
  heroOpacity: Number(getComputedStyle(document.querySelector(".hero .container")).opacity),
  dailyTransform: getComputedStyle(document.querySelector("#daily")).transform,
}))()`);
check("首屏与第二屏随滚动连续交接",
  heroHandoff.progress > 0.25 && heroHandoff.heroOpacity < 0.9 && heroHandoff.dailyTransform !== "none",
  JSON.stringify(heroHandoff));
await cdp.eval(`scrollTo(0, 0)`);
await sleep(220);
await cdp.eval(`document.getElementById("nav-toggle").click()`);
await sleep(450);
const menuMotion = await cdp.eval(`(() => {
  const p = document.getElementById("mobile-nav");
  return { open: p.classList.contains("open"), aria: p.getAttribute("aria-hidden"), opacity: getComputedStyle(p).opacity, visibility: getComputedStyle(p).visibility };
})()`);
check("移动菜单展开完成后清晰可见", menuMotion.open && menuMotion.aria === "false" && menuMotion.opacity === "1" && menuMotion.visibility === "visible", JSON.stringify(menuMotion));

const ipadTargets = await cdp.eval(`(() => {
  const selectors = [
    ".site-header .brand", ".site-header .lang-switch", ".site-header .theme-toggle",
    ".site-header .nav-toggle", ".device-switch-btn", ".story-progress-link"
  ];
  const targets = [...document.querySelectorAll(selectors.join(","))]
    .filter(el => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0)
    .map(el => ({ label: el.textContent.trim() || el.getAttribute("aria-label"), h: Math.round(el.getBoundingClientRect().height) }));
  return { targets, min: Math.min(...targets.map(x => x.h)) };
})()`);
check("iPad 主要触控目标至少 44px", ipadTargets.min >= 44, JSON.stringify(ipadTargets.targets));

await goto("http://localhost:8099/", 1024, 1180);
const desktopHeader1024 = await cdp.eval(`(() => {
  const root = document.documentElement;
  const c = document.querySelector(".site-header .container").getBoundingClientRect();
  const visible = [...document.querySelectorAll(".site-header .container > *")]
    .filter(el => getComputedStyle(el).display !== "none")
    .map(el => ({ cls: el.className, left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }));
  const overlaps = visible.some((item, i) => i > 0 && item.left < visible[i - 1].right - 1);
  return { overflow: root.scrollWidth > root.clientWidth + 1, within: visible.every(x => x.left >= c.left - 1 && x.right <= c.right + 1), overlaps, visible };
})()`);
check("1024px 页头元素不重叠", !desktopHeader1024.overlaps && desktopHeader1024.within, JSON.stringify(desktopHeader1024.visible));
check("1024px 首页无横向溢出", !desktopHeader1024.overflow);
const desktopHeaderTargets = await cdp.eval(`(() => {
  const targets = [...document.querySelectorAll(".site-header a, .site-header button")]
    .filter(el => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0)
    .map(el => ({ label: el.textContent.trim() || el.getAttribute("aria-label"), h: Math.round(el.getBoundingClientRect().height) }));
  return { targets, min: Math.min(...targets.map(x => x.h)) };
})()`);
check("桌面页头主要触控目标至少 44px", desktopHeaderTargets.min >= 44, JSON.stringify(desktopHeaderTargets.targets));

// ---- 隐私要点在各设备上保持 4 / 2 / 1 列，不出现 3 + 1 孤立布局 ----
for (const [label, width, height, expectedCols] of [
  ["桌面", 1280, 900, 4],
  ["iPad", 820, 1180, 2],
  ["手机", 390, 844, 1],
]) {
  await goto("http://localhost:8099/#privacy", width, height);
  const privacyLayout = await cdp.eval(`(() => {
    const items = [...document.querySelectorAll(".privacy-item")];
    const lefts = [...new Set(items.map(el => Math.round(el.getBoundingClientRect().left)))];
    const widths = items.map(el => Math.round(el.getBoundingClientRect().width));
    return { count: items.length, cols: lefts.length, widths };
  })()`);
  check(`${label}隐私要点排列均衡`, privacyLayout.count === 4 && privacyLayout.cols === expectedCols, JSON.stringify(privacyLayout));
}

// ---- 桌面并排布局：手机与 iPad 同屏可见 ----
await goto("http://localhost:8099/", 1440, 3400);
const sideBySide = await cdp.eval(`(() => {
  const grid = document.querySelector("[data-device-grid]");
  const view = grid.getAttribute("data-view");
  const phoneR = document.querySelector('[data-device-col="phone"]').getBoundingClientRect();
  const padR = document.querySelector('[data-device-col="ipad"]').getBoundingClientRect();
  return { view, phoneRight: Math.round(phoneR.right), padLeft: Math.round(padR.left), sideBySide: padR.left >= phoneR.right - 4 };
})()`);
check("桌面默认 iPhone+iPad 并排", sideBySide.view === "both" && sideBySide.sideBySide, JSON.stringify(sideBySide));
await cdp.eval(`document.querySelector('[data-story-chapter="2"]').scrollIntoView({block:"center"})`);
await sleep(700);
const motionStory = await cdp.eval(`(() => ({
  active: document.querySelector('[data-story-chapter="2"]').classList.contains("is-active"),
  stage: document.querySelector("[data-story-stage]").getAttribute("data-active"),
  direction: document.querySelector("[data-story-stage]").getAttribute("data-direction"),
  header: document.querySelector(".site-header").classList.contains("is-scrolled"),
}))()`);
check("滚动故事同步聚焦当前章节", motionStory.active && motionStory.stage === "2", JSON.stringify(motionStory));
check("滚动后页头进入轻量悬浮状态", motionStory.header, JSON.stringify(motionStory));

// ---- 白天/夜间背景与正文对比度 ----
async function themeColors() {
  return cdp.eval(`(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const ink = getComputedStyle(document.querySelector("h1")).color;
    const ink3 = getComputedStyle(document.querySelector(".hero-assurances")).color;
    return { bg, ink, ink3, theme: document.documentElement.getAttribute("data-theme") };
  })()`);
}
await setTheme("light");
const lightCols = await themeColors();
check("白天模式背景为温暖米白", lightCols.bg === "rgb(248, 246, 239)" && lightCols.theme === "light", JSON.stringify(lightCols));

await setTheme("dark");
const darkCols = await themeColors();
check("夜间模式背景为深绿黑（非纯黑）", darkCols.bg === "rgb(16, 23, 21)" && darkCols.theme === "dark", JSON.stringify(darkCols));

// 对比度计算
function lum(rgbStr) {
  const m = rgbStr.match(/rgba?\((\d+), (\d+), (\d+)/);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
const lightCR = contrast(lightCols.ink, lightCols.bg);
const lightCR3 = contrast(lightCols.ink3, lightCols.bg);
console.log(`INFO  白天 h1 对比度 ${lightCR.toFixed(2)}:1，辅助文字 ${lightCR3.toFixed(2)}:1`);
check("白天 h1 对比度 ≥ 7:1", lightCR >= 7);
check("白天辅助文字对比度 ≥ 4.5:1", lightCR3 >= 4.5);
const darkCR = contrast(darkCols.ink, darkCols.bg);
const darkCR3 = contrast(darkCols.ink3, darkCols.bg);
console.log(`INFO  夜间 h1 对比度 ${darkCR.toFixed(2)}:1，辅助文字 ${darkCR3.toFixed(2)}:1`);
check("夜间 h1 对比度 ≥ 7:1", darkCR >= 7);
check("夜间辅助文字对比度 ≥ 4.5:1", darkCR3 >= 4.5);

// ---- reduced-motion：reveal 内容立即可见 ----
await cdp.send("Emulation.setEmulatedMedia", {
  media: "screen",
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await cdp.send("Page.navigate", { url: "http://localhost:8099/" });
await sleep(1800);
const reduced = await cdp.eval(`(() => {
  const hidden = [...document.querySelectorAll(".js .reveal")].filter(el => getComputedStyle(el).opacity !== "1").length;
  const smooth = getComputedStyle(document.documentElement).scrollBehavior;
  const dailyTransform = getComputedStyle(document.querySelector("#daily")).transform;
  return { hiddenReveals: hidden, scrollBehavior: smooth, dailyTransform };
})()`);
check("reduced-motion 下 reveal 全部可见", reduced.hiddenReveals === 0, `hidden=${reduced.hiddenReveals}`);
check("reduced-motion 下禁用平滑滚动", reduced.scrollBehavior === "auto", `behavior=${reduced.scrollBehavior}`);
check("reduced-motion 下区块交接保持静态", reduced.dailyTransform === "none", JSON.stringify(reduced));
await cdp.send("Emulation.setEmulatedMedia", { media: "screen", features: [] });

// ---- 敏感信息检查（所有页面源码） ----
const secrets = await cdp.eval(`(async () => {
  const pats = ["api[_-]?key", "bearer ", "client[_-]?secret", "password", "BEGIN.*PRIVATE KEY", "sk-"];
  const out = [];
  for (const p of ["/", "/features/", "/privacy/", "/terms/", "/support/", "/safety/"]) {
    const res = await fetch(p);
    const html = await res.text();
    for (const re of pats) {
      const m = html.toLowerCase().match(new RegExp(re));
      if (m) out.push(p + ":" + re);
    }
  }
  return out;
})()`);
check("全站无敏感信息（密钥/口令）", secrets.length === 0, JSON.stringify(secrets));

// 全站链接与基础语义（所有页面锚点/路径、唯一 ID、控件名称、图片替代文本）
const semanticIssues = [];
for (const p of ["", "404.html", "privacy/", "terms/", "support/", "safety/", "features/", "philosophy/",
                 "en/", "en/features/", "en/philosophy/", "en/privacy/", "en/terms/",
                 "en/support/", "en/safety/"]) {
  await goto("http://localhost:8099/" + p, 1440, 1200);
  const audit = await cdp.eval(`(() => {
    const hrefs = [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href"));
    const badAnchor = hrefs.filter(h => h.startsWith("#") && h.length > 1 && !document.getElementById(h.slice(1)));
    const badRel = hrefs.filter(h => /^\\/(?!privacy|terms|support|safety|features|philosophy|en|index|sitemap|assets|favicon|app-icon|robots)/.test(h));
    const ids = [...document.querySelectorAll("[id]")].map(el => el.id);
    const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    const unnamedControls = [...document.querySelectorAll("a[href], button")]
      .filter(el => !((el.getAttribute("aria-label") || el.textContent || "").trim()) && !el.querySelector('img[alt]:not([alt=""])'))
      .map(el => el.tagName + "." + el.className);
    const missingAlt = [...document.images].filter(img => !img.hasAttribute("alt")).map(img => img.getAttribute("src"));
    return {
      badAnchor,
      badRel: badRel.filter(h => h !== "/" && !h.startsWith("/#")),
      duplicateIds, unnamedControls, missingAlt,
      h1Count: document.querySelectorAll("main h1").length,
    };
  })()`);
  const label = p || "/";
  check(`${label} 页锚点有效`, audit.badAnchor.length === 0, JSON.stringify(audit.badAnchor));
  check(`${label} 页链接目标有效`, audit.badRel.length === 0, JSON.stringify(audit.badRel));
  if (audit.duplicateIds.length || audit.unnamedControls.length || audit.missingAlt.length || audit.h1Count !== 1) {
    semanticIssues.push({ page: label, ...audit });
  }
}
check("全站基础语义结构完整", semanticIssues.length === 0, JSON.stringify(semanticIssues));

console.log("\n===== 汇总 =====");
const failed = results.filter(r => !r.ok);
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
failed.forEach(f => console.log("  ✗", f.name));
cdp.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
