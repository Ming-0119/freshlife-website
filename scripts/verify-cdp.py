#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FreshLife 官网交互与无障碍验证（Python 标准库 + 本机 Chrome CDP）

零依赖：不要求 Node/第三方库。用系统临时目录存放浏览器 profile。
用法：
    python3 -m http.server 8099 --bind 127.0.0.1   # 终端 1
    python3 scripts/verify-cdp.py                    # 终端 2

覆盖：主题（跟随系统/切换/持久化/全页面）、移动导航、Tab 键盘方向键、
iPad 侧边栏、设备切换、滚动叙事、键盘焦点环、reduced-motion、
页内锚点、320px 溢出、敏感信息、构建一致性（资产哈希/链接目标）。
"""
import base64
import hashlib
import json
import os
import random
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SITE = "http://localhost:8099"
DEBUG_PORT = 9335
PAGES = ["/", "/features/", "/privacy/", "/terms/", "/support/", "/safety/"]

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(("PASS  " if ok else "FAIL  ") + name + (("  — " + detail) if detail else ""))


# --------------------------------------------------------------------------
# 极简 WebSocket 客户端（RFC 6455，仅文本帧，用于 CDP）
# --------------------------------------------------------------------------
class WS:
    def __init__(self, url):
        self.sock = None
        self._connect(url)
        self.buf = b""

    def _connect(self, url):
        from urllib.parse import urlparse
        u = urlparse(url)
        host, port = u.hostname, u.port or 80
        self.sock = socket.create_connection((host, port), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        path = u.path or "/"
        req = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n" % (path, host, port, key)
        )
        self.sock.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("websocket handshake failed")
            resp += chunk
        if b" 101 " not in resp.split(b"\r\n", 1)[0]:
            raise ConnectionError("websocket handshake rejected: %r" % resp[:200])

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("socket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _read_frame(self):
        h1, h2 = self._recv_exact(2)
        opcode = h1 & 0x0F
        masked = h2 & 0x80
        length = h2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._recv_exact(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._recv_exact(8))[0]
        mask = self._recv_exact(4) if masked else None
        payload = bytearray(self._recv_exact(length))
        if mask:
            for i in range(length):
                payload[i] ^= mask[i % 4]
        return opcode, bytes(payload)

    def _send_frame(self, opcode, payload):
        length = len(payload)
        header = bytearray([0x80 | opcode])
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", length)
        mask = os.urandom(4)
        header += mask
        masked = bytearray(payload)
        for i in range(length):
            masked[i] ^= mask[i % 4]
        self.sock.sendall(bytes(header) + bytes(masked))

    def send_text(self, text):
        self._send_frame(0x1, text.encode("utf-8"))

    def recv_text(self):
        while True:
            opcode, payload = self._read_frame()
            if opcode == 0x9:  # ping -> pong
                self._send_frame(0xA, payload)
                continue
            if opcode == 0x8:  # close
                raise ConnectionError("websocket closed by peer")
            if opcode in (0x1, 0x2):  # text / binary
                return payload.decode("utf-8", "replace")

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self.id = 0
        self.pending = {}

    def send(self, method, params=None):
        self.id += 1
        msg = {"id": self.id, "method": method, "params": params or {}}
        self.ws.send_text(json.dumps(msg))
        while True:
            data = json.loads(self.ws.recv_text())
            if data.get("id") == self.id:
                if "error" in data:
                    raise RuntimeError(data["error"])
                return data.get("result", {})
            if data.get("method") == "Runtime.consoleAPICalled":
                continue

    def evaluate(self, expr):
        res = self.send("Runtime.evaluate", {
            "expression": expr, "returnByValue": True, "awaitPromise": True,
        })
        if "exceptionDetails" in res:
            raise RuntimeError("eval error: %r" % res["exceptionDetails"])
        return res["result"].get("value")


def launch_chrome(port):
    profile = tempfile.mkdtemp(prefix="freshlife-verify-", dir="/tmp")
    proc = subprocess.Popen([
        CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
        "--disable-background-networking", "--disable-crashpad",
        "--user-data-dir=%s" % profile, "--remote-debugging-port=%d" % port,
        "--window-size=1440,3400", "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc, profile


def get_ws_url(port, tries=40):
    for _ in range(tries):
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port, timeout=2) as r:
                pages = json.loads(r.read())
            for p in pages:
                if p.get("type") == "page":
                    return p["webSocketDebuggerUrl"]
        except Exception:
            pass
        time.sleep(0.25)
    raise RuntimeError("CDP endpoint not ready")


def main():
    if not os.path.exists(CHROME):
        print("未找到 Chrome：%s" % CHROME)
        sys.exit(2)

    proc, profile = launch_chrome(DEBUG_PORT)
    cdp = None
    try:
        ws_url = get_ws_url(DEBUG_PORT)
        cdp = CDP(WS(ws_url))
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")

        def goto(path, w=1440, h=3400):
            cdp.send("Emulation.setDeviceMetricsOverride", {
                "width": w, "height": h, "deviceScaleFactor": 1, "mobile": w <= 720,
            })
            cdp.send("Page.navigate", {"url": SITE + path})
            time.sleep(1.6)

        def reload():
            cdp.send("Page.navigate", {"url": SITE + "/"})
            time.sleep(1.6)

        # ---- 1. 主题：跟随系统 + 切换 + 持久化 ----
        reload()
        theme = cdp.evaluate("(() => { const r=document.documentElement; return { attr: r.getAttribute('data-theme'), saved: localStorage.getItem('freshlife-theme'), sysDark: matchMedia('(prefers-color-scheme: dark)').matches, toggles: document.querySelectorAll('.theme-toggle').length }; })()")
        expected = "dark" if theme["sysDark"] else "light"
        check("首次访问跟随系统", theme["attr"] == expected and theme["saved"] is None,
              "attr=%s sys=%s" % (theme["attr"], theme["sysDark"]))
        check("首页主题按钮存在", theme["toggles"] >= 1)

        cdp.evaluate("document.getElementById('theme-toggle').click()")
        time.sleep(0.5)
        after = cdp.evaluate("(() => ({ attr: document.documentElement.getAttribute('data-theme'), saved: localStorage.getItem('freshlife-theme') }))()")
        expected_after = "light" if expected == "dark" else "dark"
        check("点击切换主题", after["attr"] == expected_after, "attr=%s" % after["attr"])
        check("偏好写入 localStorage", after["saved"] == expected_after)

        # 各页面继承偏好 + 都有主题按钮
        for path in ["/features/", "/privacy/", "/terms/", "/support/", "/safety/"]:
            goto(path, 1440, 1200)
            st = cdp.evaluate("(() => ({ attr: document.documentElement.getAttribute('data-theme'), toggles: document.querySelectorAll('.theme-toggle').length, main: !!document.getElementById('main') }))()")
            check("%s 继承主题且双主题可用" % path,
                  st["attr"] == expected_after and st["toggles"] >= 1 and st["main"],
                  json.dumps(st))

        # 404 主题（404.html 由托管平台对未匹配路径生效；本地直接加载验证内容）
        goto("/404.html", 1440, 1000)
        nf = cdp.evaluate("(() => ({ attr: document.documentElement.getAttribute('data-theme'), code: document.querySelector('.notfound .code')?.textContent, toggles: document.querySelectorAll('.theme-toggle').length }))()")
        check("404 有主题按钮且渲染", nf["attr"] == expected_after and nf["code"] == "404" and nf["toggles"] >= 1)

        # 刷新后保持（回到首页）
        goto("/", 1440, 3400)
        kept = cdp.evaluate("document.documentElement.getAttribute('data-theme')")
        check("刷新后保持手动选择", kept == expected_after, "attr=%s" % kept)

        # ---- 2. 设备切换 ----
        dev = cdp.evaluate("(() => { const g=document.querySelector('[data-device-grid]'); return { view: g.getAttribute('data-view'), n: document.querySelectorAll('[data-device-view]').length }; })()")
        check("设备切换按钮 3 个", dev["n"] == 3)
        check("桌面默认并排", dev["view"] == "both", "view=%s" % dev["view"])
        cdp.evaluate("document.querySelector('[data-device-view=\"ipad\"]').click()")
        time.sleep(0.3)
        ipad_only = cdp.evaluate("(() => { const g=document.querySelector('[data-device-grid]'); return { view: g.getAttribute('data-view'), phoneHidden: getComputedStyle(document.querySelector('[data-device-col=\"phone\"]')).display === 'none' }; })()")
        check("切到只看 iPad", ipad_only["view"] == "ipad" and ipad_only["phoneHidden"])

        # ---- 3. iPad 侧边栏 ----
        cdp.evaluate("document.querySelector('[data-ipad-target=\"pantry\"]').click()")
        time.sleep(0.3)
        ipad_switch = cdp.evaluate("(() => ({ pantry: document.querySelector('[data-ipad-page=\"pantry\"]').classList.contains('active'), today: !document.querySelector('[data-ipad-page=\"today\"]').classList.contains('active'), pressed: document.querySelector('[data-ipad-target=\"pantry\"]').getAttribute('aria-pressed') }))()")
        check("iPad 侧边栏切到库存", ipad_switch["pantry"] and ipad_switch["today"] and ipad_switch["pressed"] == "true")

        # 恢复并排视图，让手机演示可见（隐藏容器内 focus 无效）
        cdp.evaluate("document.querySelector('[data-device-view=\"both\"]').click()")
        time.sleep(0.3)

        # ---- 4. 手机 Tab 切换 + 键盘方向键 ----
        cdp.evaluate("document.querySelector('[data-target=\"meals\"]').click()")
        time.sleep(0.3)
        tab = cdp.evaluate("(() => ({ meals: document.getElementById('mock-meals').classList.contains('active'), points: document.getElementById('tab-points').textContent.includes('餐食') }))()")
        check("iPhone 标签切到膳食", tab["meals"])
        check("说明列表联动更新", tab["points"])

        cdp.evaluate("document.querySelector('.mock-tab[data-target=\"meals\"]').focus()")
        cdp.evaluate("document.querySelector('.mock-tabbar').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))")
        time.sleep(0.3)
        arrow = cdp.evaluate("(() => ({ active: document.querySelector('.mock-tab[aria-selected=\"true\"]')?.getAttribute('data-target'), explore: document.getElementById('mock-explore').classList.contains('active') }))()")
        check("Tab 键盘方向键切换", arrow["active"] == "explore" and arrow["explore"], json.dumps(arrow))

        # ---- 5. 桌面滚动叙事：四章依次驱动同一个稳定舞台 ----
        goto("/", 1440, 900)
        story = cdp.evaluate("(() => ({ chapters: document.querySelectorAll('[data-story-chapter]').length, indicators: document.querySelectorAll('[data-story-indicator]').length, stageVisible: getComputedStyle(document.querySelector('[data-story-stage]')).display !== 'none', sticky: getComputedStyle(document.querySelector('.story-stage-col')).position }))()")
        check("滚动叙事包含四个完整章节", story["chapters"] == 4 and story["indicators"] == 4, json.dumps(story))
        check("桌面滚动叙事使用稳定舞台", story["stageVisible"] and story["sticky"] == "sticky", json.dumps(story))
        for n in range(1, 5):
            cdp.evaluate("document.querySelector('[data-story-chapter=\"%d\"]').scrollIntoView({block:'center'})" % n)
            time.sleep(0.7)
            active = cdp.evaluate("(() => ({ stage: document.querySelector('[data-story-stage]').getAttribute('data-active'), current: document.querySelector('[data-story-indicator][aria-current=\"step\"]')?.getAttribute('data-story-indicator'), visible: getComputedStyle(document.querySelector('.story-screen--%d')).opacity }))()" % n)
            check("滚动到第 %d 章时画面与进度同步" % n,
                  active["stage"] == str(n) and active["current"] == str(n) and float(active["visible"]) > 0.99,
                  json.dumps(active))

        # ---- 6. 移动导航 + 故事静态退化 ----
        goto("/", 390, 844)
        mob = cdp.evaluate("(() => { const t=document.getElementById('nav-toggle'); return { toggle: getComputedStyle(t).display !== 'none', linksHidden: getComputedStyle(document.querySelector('.nav-links')).display === 'none' }; })()")
        check("移动端汉堡按钮显示", mob["toggle"])
        check("移动端桌面导航隐藏", mob["linksHidden"])
        cdp.evaluate("document.getElementById('nav-toggle').click()")
        time.sleep(0.3)
        opened = cdp.evaluate("document.getElementById('mobile-nav').classList.contains('open') && document.getElementById('nav-toggle').getAttribute('aria-expanded') === 'true'")
        check("移动菜单打开", opened)
        cdp.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
        time.sleep(0.3)
        esc = cdp.evaluate("!document.getElementById('mobile-nav').classList.contains('open') && document.activeElement === document.getElementById('nav-toggle')")
        check("Escape 关闭菜单并还焦", esc)
        mobile_story = cdp.evaluate("(() => ({ stageHidden: getComputedStyle(document.querySelector('[data-story-stage]')).display === 'none', miniVisible: [...document.querySelectorAll('.story-mini')].every(el => getComputedStyle(el).display !== 'none'), sticky: getComputedStyle(document.querySelector('.story-stage-col')).position }))()")
        check("手机端故事改为普通内容流", mobile_story["stageHidden"] and mobile_story["miniVisible"] and mobile_story["sticky"] != "sticky", json.dumps(mobile_story))

        # ---- 7. 键盘焦点环 ----
        goto("/", 1440, 3400)
        focused = cdp.evaluate("(() => { const el=document.getElementById('theme-toggle'); el.focus(); return document.activeElement === el && getComputedStyle(el).outlineWidth !== '0px'; })()")
        check("键盘焦点环可见", focused)

        # ---- 8. reduced-motion：reveal 全部可见、无平滑滚动、无 sticky 舞台 ----
        cdp.send("Emulation.setEmulatedMedia", {
            "media": "screen",
            "features": [{"name": "prefers-reduced-motion", "value": "reduce"}],
        })
        reload()
        reduced = cdp.evaluate("(() => ({ hidden: [...document.querySelectorAll('.js .reveal')].filter(el => getComputedStyle(el).opacity !== '1').length, smooth: getComputedStyle(document.documentElement).scrollBehavior, stageHidden: getComputedStyle(document.querySelector('[data-story-stage]')).display === 'none', miniVisible: [...document.querySelectorAll('.story-mini')].every(el => getComputedStyle(el).display !== 'none'), sticky: getComputedStyle(document.querySelector('.story-stage-col')).position }))()")
        check("reduced-motion 下 reveal 全部可见", reduced["hidden"] == 0, "hidden=%d" % reduced["hidden"])
        check("reduced-motion 下禁用平滑滚动", reduced["smooth"] == "auto", reduced["smooth"])
        check("reduced-motion 下故事为静态内容流", reduced["stageHidden"] and reduced["miniVisible"] and reduced["sticky"] != "sticky", json.dumps(reduced))
        cdp.send("Emulation.setEmulatedMedia", {"media": "screen", "features": []})

        # ---- 9. 页内锚点 + 链接目标（全部页面） ----
        for path in PAGES:
            goto(path, 1440, 1200)
            audit = cdp.evaluate("(() => { const hrefs=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')); const badAnchor=hrefs.filter(h=>h.startsWith('#') && h.length>1 && !document.getElementById(h.slice(1))); return { badAnchor }; })()")
            check("%s 锚点全部有效" % path, len(audit["badAnchor"]) == 0, json.dumps(audit["badAnchor"]))

        # ---- 10. 320px 无横向溢出（首页 + features） ----
        for path in ["/", "/features/"]:
            goto(path, 320, 700)
            ov = cdp.evaluate("(() => { const s=document.documentElement.scrollWidth, c=document.documentElement.clientWidth; return { overflow: s > c + 1, s, c }; })()")
            check("%s 320px 无横向溢出" % path, not ov["overflow"], "scrollW=%d clientW=%d" % (ov["s"], ov["c"]))

        # ---- 11. 敏感信息（抓取全部页面源码扫描） ----
        secrets = []
        pats = ["api[_-]?key", "bearer ", "client[_-]?secret", "password", "BEGIN .*PRIVATE KEY", "sk-[a-z0-9]"]
        for path in PAGES:
            try:
                with urllib.request.urlopen(SITE + path, timeout=5) as r:
                    html = r.read().decode("utf-8", "replace").lower()
            except Exception:
                html = ""
            for p in pats:
                if re.search(p, html):
                    secrets.append(path + ":" + p)
        check("全站无敏感信息（密钥/口令）", len(secrets) == 0, json.dumps(secrets))

        # ---- 12. 构建一致性：资产引用、sitemap、robots ----
        with urllib.request.urlopen(SITE + "/", timeout=5) as r:
            index_html = r.read().decode("utf-8", "replace")
        css_m = re.findall(r'assets/(main-[0-9a-f]{10}\.css)', index_html)
        js_m = re.findall(r'assets/(main-[0-9a-f]{10}\.js)', index_html)
        check("首页引用哈希 CSS/JS", len(css_m) == 1 and len(js_m) == 1, "%s / %s" % (css_m, js_m))
        for name in css_m + js_m:
            with urllib.request.urlopen(SITE + "/assets/" + name, timeout=5) as r:
                check("资产 %s 可访问" % name, r.status == 200)
        with urllib.request.urlopen(SITE + "/sitemap.xml", timeout=5) as r:
            sitemap = r.read().decode("utf-8", "replace")
        check("sitemap 包含 /features/", "/features/" in sitemap and "/privacy/" in sitemap)
        with urllib.request.urlopen(SITE + "/robots.txt", timeout=5) as r:
            robots = r.read().decode("utf-8", "replace")
        check("robots 含 Sitemap 声明", "Sitemap:" in robots)

        # ---- 13. 对比度采样（白天/夜间背景） ----
        # 前面的用例会保留用户主题偏好；先显式切回白天，避免依赖用例顺序。
        cdp.evaluate("if (document.documentElement.getAttribute('data-theme') !== 'light') document.getElementById('theme-toggle').click()")
        time.sleep(0.5)
        colors = cdp.evaluate("(() => { const bg=getComputedStyle(document.body).backgroundColor; const ink=getComputedStyle(document.querySelector('h1')).color; return { bg, ink, theme: document.documentElement.getAttribute('data-theme') }; })()")
        check("白天背景为温暖米白", colors["bg"] == "rgb(248, 246, 239)" and colors["theme"] == "light", colors["bg"])
        cdp.evaluate("document.getElementById('theme-toggle').click()")
        time.sleep(0.5)
        dark = cdp.evaluate("(() => ({ bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.getAttribute('data-theme') }))()")
        check("夜间背景为深绿黑（非纯黑）", dark["bg"] == "rgb(16, 23, 21)" and dark["theme"] == "dark", dark["bg"])

    finally:
        if cdp is not None:
            try:
                cdp.send("Browser.close")
            except Exception:
                pass
        proc.kill()
        shutil.rmtree(profile, ignore_errors=True)

    failed = [r for r in results if not r[1]]
    print("\n===== 汇总 =====")
    print("共 %d 项，通过 %d，失败 %d" % (len(results), len(results) - len(failed), len(failed)))
    for name, ok in failed:
        print("  ✗", name)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
