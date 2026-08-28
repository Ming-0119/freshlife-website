#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FreshLife 官网构建脚本（零依赖，仅 Python 标准库）

用法：
    python3 scripts/build.py [--check-only]

职责：
  1. 从 site/templates（含共享 partial）+ site/content 渲染页面到仓库根目录
     （GitHub → 阿里云静态托管可直接使用根目录内容）；
  2. 将 CSS/JS 以内容哈希文件名输出到 assets/（配合 _headers 的
     immutable 缓存规则，发布滚动安全）；
  3. 生成 robots.txt / sitemap.xml / _headers / BUILD_PROVENANCE.txt；
  4. 清理上一次构建遗留的旧产物（.vite/、旧 assets 等）；
  5. 构建后自检：内部链接、锚点 id、未替换占位符。

页面：
  index.html 首页（品牌价值 + 日常场景 + 功能清单 + 上线状态）
  features/index.html 完整功能页（每项功能：能帮什么/怎么用/注意什么/当前状态）
  privacy/ terms/ support/ safety/ 法律与支持页
  404.html 页面不存在
"""
import hashlib
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
TEMPLATES = SITE / "templates"
CONTENT = SITE / "content"
STATIC = SITE / "static"
STYLES = SITE / "styles"
SCRIPTS = SITE / "scripts"
ASSETS = ROOT / "assets"

CONFIG = json.loads((SITE / "config.json").read_text(encoding="utf-8"))
FEATURES = json.loads((CONTENT / "features.json").read_text(encoding="utf-8"))

# --------------------------------------------------------------------------
# 图标（SF-Symbols 风格线性图标，stroke 1.8，统一 24 viewBox）
# --------------------------------------------------------------------------
ICONS = {
    "house": '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>',
    "fridge": '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 10h14"/><path d="M10 10v3"/>',
    "fork": '<path d="M7 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M9.5 3v18"/><path d="M18 3v18"/><path d="M18 3c-3 3-3 9 0 12"/>',
    "grid": '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    "person": '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
    "camera": '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-2.5h5L16 7"/>',
    "qr": '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2M18 14h2M14 18h2M18 18v2M16 16h2"/>',
    "photo": '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5.5-5.5L8 18"/><path d="M3 16l4-4 2.5 2.5"/>',
    "pencil": '<path d="M4 20l1-4L17 4l3 3L8 19l-4 1z"/><path d="M14.5 6.5l3 3"/>',
    "chip": '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    "chat": '<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V5z"/>',
    "shield": '<path d="M12 3l7 2.8v5.4c0 4.4-3 7.6-7 8.8-4-1.2-7-4.4-7-8.8V5.8L12 3z"/><path d="M9 11.5l2 2 4-4"/>',
    "phone": '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    "user": '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
    "bell": '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5H4.5L6 16z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    "export": '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>',
    "lock": '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    "list": '<path d="M9 5h11M9 12h11M9 19h11"/><path d="M4 5l1.5 1.5L8 3.5M4 12l1.5 1.5L8 10.5M4 19l1.5 1.5L8 17.5"/>',
    "chart": '<path d="M4 20h16"/><path d="M6 20v-6M12 20V8M18 20v-10"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.9-3 3.4-4.5 6.5-4.5s5.6 1.5 6.5 4.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 15.5c2.6.2 4.6 1.6 5 4.5"/>',
    "trophy": '<path d="M8 4h8v6a4 4 0 0 1-8 0V4z"/><path d="M6 5H4v2a3 3 0 0 0 3 3M18 5h2v2a3 3 0 0 1-3 3"/><path d="M12 14v4M9 21h6M12 18v3"/>',
    "cloud": '<path d="M7 18a4.5 4.5 0 1 1 .8-8.9A6 6 0 0 1 18.5 11 4 4 0 0 1 17.5 18H7z"/>',
    "cart": '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M2.5 4h2l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.9a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6"/>',
    "sparkle": '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z"/>',
    "check": '<path d="M20 6L9 17l-5-5"/>',
    "leaf": '<path d="M5 19C5 9 12 4 20 4c0 8-5 15-15 15z"/><path d="M5 19c3-6 8-10 12-12"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z"/>',
    "moon": '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
}

# 首页专用的 Open Graph 标签（其余页面不输出）
INDEX_OG = (
    '<meta property="og:type" content="website"/>\n'
    '<meta property="og:title" content="FreshLife — 记住家里有什么，吃得更从容"/>\n'
    '<meta property="og:description" content="本地优先的家庭食物管理：库存、临期提醒、餐食规划与购物清单。iPhone 与 iPad 通用，无需注册账号。"/>\n'
    '<meta property="og:image" content="/app-icon.png"/>'
)

_PARTIALS = {}


def partial(name):
    if name not in _PARTIALS:
        _PARTIALS[name] = (TEMPLATES / name).read_text(encoding="utf-8")
    return _PARTIALS[name]


def icon(name, cls=None):
    body = ICONS.get(name, ICONS["check"])
    return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" '
        'aria-hidden="true">' + body + "</svg>"
    )


def esc(text):
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def hash_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:10]


def write_if_changed(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, str):
        content = content.encode("utf-8")
    if path.exists() and path.read_bytes() == content:
        return False
    path.write_bytes(content)
    return True


# --------------------------------------------------------------------------
# 渲染辅助
# --------------------------------------------------------------------------

def render_template(tpl_name, subs):
    tpl = (TEMPLATES / tpl_name).read_text(encoding="utf-8")
    for key, value in subs.items():
        tpl = tpl.replace("{{" + key + "}}", value)
    # 统一为一个结尾换行，避免 partial 自带换行造成构建产物出现空白尾行。
    return tpl.rstrip() + "\n"


def theme_toggle(cls="", id_suffix="", aria_label="切换到夜间模式", label="夜间"):
    tpl = partial("_theme_toggle.html")
    return (
        tpl.replace("{{cls}}", cls)
        .replace("{{id_suffix}}", id_suffix)
        .replace("{{aria_label}}", esc(aria_label))
        .replace("{{label}}", esc(label))
    )


def build_head(title, description, css_tag, robots="index, follow", og_tags=""):
    tpl = partial("_head.html")
    return (
        tpl.replace("{{title}}", esc(title))
        .replace("{{description}}", esc(description))
        .replace("{{robots}}", esc(robots))
        .replace("{{og_tags}}", og_tags)
        .replace("{{css}}", css_tag)
    )


def build_site_header(nav_html, nav_mobile_html, cta_href="/features/", cta_label="查看完整功能"):
    tpl = partial("_site_header.html")
    return (
        tpl.replace("{{nav}}", nav_html)
        .replace("{{nav_mobile}}", nav_mobile_html)
        .replace("{{theme_toggle}}", theme_toggle())
        .replace("{{nav_cta_href}}", esc(cta_href))
        .replace("{{nav_cta_label}}", esc(cta_label))
        .replace(
            "{{theme_toggle_mobile}}",
            theme_toggle(
                cls=" theme-toggle--mobile",
                id_suffix="-mobile",
                aria_label="切换到夜间模式",
                label="切换到夜间模式",
            ),
        )
    )


def build_site_footer(product_links, legal_links, year, developer, js_tag):
    tpl = partial("_site_footer.html")
    return (
        tpl.replace("{{footer_product}}", product_links)
        .replace("{{footer_legal}}", legal_links)
        .replace("{{year}}", year)
        .replace("{{developer}}", developer)
        .replace("{{js}}", js_tag)
    )


def build_nav():
    links = []
    for item in CONFIG["nav"]:
        links.append('<a href="%s">%s</a>' % (esc(item["href"]), esc(item["label"])))
    return "\n".join(links)


def build_nav_mobile():
    links = []
    for item in CONFIG["nav"]:
        links.append(
            '<a href="%s">%s<small>FreshLife</small></a>'
            % (esc(item["href"]), esc(item["label"]))
        )
    links.append('<a href="/features/">查看完整功能<small>完整功能与上线状态</small></a>')
    return "\n".join(links)


def build_why():
    out = []
    for w in FEATURES["why"]:
        out.append(
            '<div class="why-card reveal">'
            '<div class="ico">%s</div>'
            "<h3>%s</h3><p>%s</p></div>"
            % (icon(w["icon"]), esc(w["title"]), esc(w["desc"]))
        )
    return "\n".join(out)


def build_workflow():
    out = []
    for w in FEATURES["workflow"]:
        out.append(
            '<div class="flow-item"><span class="num">%s</span>'
            "<span class=\"ft\"><b>%s</b><small>%s</small></span></div>"
            % (esc(w["step"]), esc(w["title"]), esc(w["desc"]))
        )
    return "\n".join(out)


def build_footer_links(key):
    return "\n".join(
        '<a href="%s">%s</a>' % (esc(i["href"]), esc(i["label"]))
        for i in CONFIG["footer" + key]
    )


def build_badge(key, label=None):
    meta = {m["key"]: m for m in FEATURES["statusLegend"]}
    text = label or meta[key]["label"]
    return '<span class="badge %s">%s</span>' % (esc(key), esc(text))


def build_legend(with_hints=True):
    items = []
    for m in FEATURES["statusLegend"]:
        swatch = "var(--green)" if m["key"] == "shipped" else (
            "var(--blue)" if m["key"] == "local" else (
                "var(--amber)" if m["key"] == "online" else "var(--ink-3)"
            )
        )
        hint = "<small> · %s</small>" % esc(m["hint"]) if with_hints else ""
        items.append(
            '<span class="item"><span class="swatch" style="background:%s"></span>%s%s</span>'
            % (swatch, esc(m["label"]), hint)
        )
    return "\n".join(items)


def build_add_methods():
    out = []
    for m in FEATURES["addMethods"]:
        out.append(
            '<div class="method-card reveal">'
            '<div class="top"><div class="ico">%s</div>%s</div>'
            "<h3>%s</h3><p class=\"desc\">%s</p>"
            '<p class="flow">%s</p>'
            '<p class="note">%s</p></div>'
            % (icon(m["icon"]), build_badge(m["status"]),
               esc(m["title"]), esc(m["desc"]),
               esc(m["flow"]), esc(m["note"]))
        )
    return "\n".join(out)


def build_ai_modes():
    out = []
    for m in FEATURES["aiModes"]:
        out.append(
            '<div class="ai-card reveal">'
            '<div class="ico">%s</div><h3>%s %s</h3>'
            '<p class="desc">%s</p></div>'
            % (icon(m["icon"]), esc(m["title"]),
               build_badge(m["status"]), esc(m["desc"]))
        )
    return "\n".join(out)


def build_privacy_points():
    out = []
    for p in FEATURES["privacyPoints"]:
        out.append(
            '<div class="privacy-item reveal">'
            '<div class="ico">%s</div>'
            "<div><h3>%s</h3><p>%s</p></div></div>"
            % (icon(p["icon"]), esc(p["title"]), esc(p["desc"]))
        )
    return "\n".join(out)


def build_feature_groups():
    out = []
    for g in FEATURES["featureGroups"]:
        rows = []
        for item in g["items"]:
            rows.append(
                '<div class="feature-row"><b>%s</b>'
                '<span class="fd">%s</span>%s</div>'
                % (esc(item["name"]), esc(item["desc"]), build_badge(item["status"]))
            )
        out.append(
            '<div class="feature-group reveal"><h3>%s</h3>'
            '<div class="feature-table">%s</div></div>'
            % (esc(g["group"]), "\n".join(rows))
        )
    return "\n".join(out)


def build_roadmap():
    out = []
    for r in FEATURES["roadmap"]:
        out.append(
            '<div class="roadmap-card reveal">'
            '<span class="flag">规划中</span>'
            '<div class="ico">%s</div><h3>%s</h3><p>%s</p></div>'
            % (icon(r["icon"]), esc(r["title"]), esc(r["desc"]))
        )
    return "\n".join(out)


def build_faq():
    out = []
    for i, item in enumerate(FEATURES["faq"]):
        out.append(
            "<details%s>"
            '<summary>%s<span class="plus" aria-hidden="true"></span></summary>'
            '<div class="a"><p>%s</p></div></details>'
            % (' open' if i == 0 else "", esc(item["q"]), esc(item["a"]))
        )
    return "\n".join(out)


def build_tab_switch_buttons():
    out = []
    for i, t in enumerate(FEATURES["fiveTabs"]):
        selected = ' aria-selected="true"' if i == 0 else ' aria-selected="false"'
        out.append(
            '<button role="tab" data-target="%s"%s aria-controls="mock-%s">%s</button>'
            % (esc(t["id"]), selected, esc(t["id"]), esc(t["name"]))
        )
    return "\n".join(out)


def build_tab_points_initial():
    t = FEATURES["fiveTabs"][0]
    return "".join(
        '<li>%s<span>%s</span></li>' % (icon("check"), esc(p)) for p in t["points"]
    )


def build_tab_points_json():
    data = {t["id"]: t["points"] for t in FEATURES["fiveTabs"]}
    return json.dumps(data, ensure_ascii=False)


# --------------------------------------------------------------------------
# 主构建
# --------------------------------------------------------------------------

def main():
    check_only = "--check-only" in sys.argv
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    site = CONFIG["site"]
    domain = site["domain"]

    if check_only:
        print("[build] 校验模式：仅检查现有产物")
    else:
        print("[build] 开始构建 FreshLife 官网…")

    # ---- 资产哈希 ----
    css_raw = (STYLES / "main.css").read_text(encoding="utf-8")
    js_raw = (SCRIPTS / "main.js").read_text(encoding="utf-8")
    css_name = "main-%s.css" % hash_file(STYLES / "main.css")
    js_name = "main-%s.js" % hash_file(SCRIPTS / "main.js")
    css_tag = '<link rel="stylesheet" href="/assets/%s"/>' % css_name
    js_tag = '<script src="/assets/%s" defer></script>' % js_name

    # ---- 共享区块 ----
    nav_html = build_nav()
    nav_mobile_html = build_nav_mobile()
    footer_product = build_footer_links("ProductLinks")
    footer_legal = build_footer_links("LegalLinks")
    year = str(site["copyrightYear"])
    developer = esc(site["developer"])

    # ---- 首页 ----
    index_meta = CONFIG["pages"]["index"]
    index_subs = {
        "head": build_head(index_meta["title"], index_meta["description"], css_tag, og_tags=INDEX_OG),
        "header": build_site_header(nav_html, nav_mobile_html),
        "footer": build_site_footer(footer_product, footer_legal, year, developer, js_tag),
        "mock_screens": (CONTENT / "mock_screens.html").read_text(encoding="utf-8"),
        "mock_ipad": (CONTENT / "mock_ipad.html").read_text(encoding="utf-8"),
        "tab_points_json": build_tab_points_json(),
        "tab_switch_buttons": build_tab_switch_buttons(),
        "tab_points_initial": build_tab_points_initial(),
        "why_cards": build_why(),
        "workflow_steps": build_workflow(),
        "add_methods": build_add_methods(),
        "ai_modes": build_ai_modes(),
        "privacy_points": build_privacy_points(),
        "legend": build_legend(with_hints=True),
        "legend_inline": build_legend(with_hints=False),
        "feature_groups": build_feature_groups(),
        "roadmap": build_roadmap(),
        "faq": build_faq(),
    }
    index_html = render_template("index.html", index_subs)

    # ---- 完整功能页 ----
    feat_meta = CONFIG["pages"]["features"]
    feat_subs = {
        "head": build_head(feat_meta["title"], feat_meta["description"], css_tag),
        # 本页 CTA 指向自己的「上线状态」分区，避免自我链接
        "header": build_site_header(nav_html, nav_mobile_html,
                                    cta_href="/features/#status", cta_label="了解上线状态"),
        "footer": build_site_footer(footer_product, footer_legal, year, developer, js_tag),
        "features_content": (CONTENT / "features_page.html").read_text(encoding="utf-8"),
    }
    features_html = render_template("features.html", feat_subs)

    # ---- 法律 / 支持页 ----
    legal_pages = {}
    for key in ("privacy", "terms", "support", "safety"):
        meta = CONFIG["pages"][key]
        content = (CONTENT / meta["content"]).read_text(encoding="utf-8")
        content = content.replace("{{developer}}", developer)
        legal_subs = {
            "head": build_head(meta["title"], meta["description"], css_tag),
            "theme_toggle": theme_toggle(),
            "content": content,
            "year": year,
            "developer": developer,
            "js": js_tag,
        }
        legal_pages[key] = (ROOT / meta["path"], render_template("legal.html", legal_subs))

    # ---- 404 ----
    nf_meta = CONFIG["pages"]["notfound"]
    nf_subs = {
        "head": build_head(nf_meta["title"], nf_meta["description"], css_tag, robots="noindex, follow"),
        "theme_toggle": theme_toggle(),
        "year": year,
        "js": js_tag,
    }
    notfound_html = render_template("404.html", nf_subs)

    # ---- 静态文件 ----
    def copy_static(name):
        dst = ROOT / name
        write_if_changed(dst, (STATIC / name).read_bytes())

    # ---- 自检（在任何写入之前先校验渲染结果） ----
    expected = {
        "index.html",
        "features/index.html",
        "404.html",
        "privacy/index.html",
        "terms/index.html",
        "support/index.html",
        "safety/index.html",
        "robots.txt",
        "sitemap.xml",
        "app-icon.png",
        "favicon.svg",
        "assets/" + css_name,
        "assets/" + js_name,
    }
    docs = [("index.html", index_html), ("features/index.html", features_html)]
    docs += [(p.name, h) for p, h in legal_pages.values()]
    docs.append(("404.html", notfound_html))
    errors = validate(docs, expected)
    if errors:
        print("\n[build] 校验失败：")
        for e in errors:
            print("  ✗", e)
        sys.exit(1)

    if check_only:
        print("[build] 校验通过 ✓（未写入任何文件）")
        return

    # ---- 写入 ----
    changed = 0
    changed += write_if_changed(ROOT / "index.html", index_html)
    changed += write_if_changed(ROOT / "features/index.html", features_html)
    for path, html in legal_pages.values():
        changed += write_if_changed(path, html)
    changed += write_if_changed(ROOT / "404.html", notfound_html)
    copy_static("app-icon.png")
    copy_static("favicon.svg")

    # 资产
    assets_written = set()
    assets_written.add(css_name)
    assets_written.add(js_name)
    changed += write_if_changed(ASSETS / css_name, css_raw)
    changed += write_if_changed(ASSETS / js_name, js_raw)

    # 清理旧资产（不在本次清单中的文件）
    removed = []
    if ASSETS.exists():
        for f in ASSETS.iterdir():
            if f.is_file() and f.name not in assets_written:
                f.unlink()
                removed.append("assets/" + f.name)
    old_dirs = [ROOT / ".vite", ROOT / ".assetsignore"]
    for d in old_dirs:
        if d.exists():
            if d.is_dir():
                shutil.rmtree(d, ignore_errors=True)
            else:
                d.unlink()
            removed.append(str(d))
    for stray in ("file.svg", "globe.svg", "window.svg"):
        p = ROOT / stray
        if p.exists():
            p.unlink()
            removed.append(stray)

    # robots.txt
    robots = (
        "User-Agent: *\n"
        "Allow: /\n\n"
        "Sitemap: %s/sitemap.xml\n"
        "Host: %s\n" % (domain, domain)
    )
    changed += write_if_changed(ROOT / "robots.txt", robots)

    # sitemap.xml
    pages = [
        ("/", "weekly", "1.0"),
        ("/features/", "weekly", "0.9"),
        ("/privacy/", "monthly", "0.7"),
        ("/terms/", "monthly", "0.7"),
        ("/support/", "monthly", "0.7"),
        ("/safety/", "monthly", "0.7"),
    ]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, freq, prio in pages:
        sitemap.append(
            "<url><loc>%s%s</loc><lastmod>%s</lastmod>"
            "<changefreq>%s</changefreq><priority>%s</priority></url>"
            % (domain, path, today, freq, prio)
        )
    sitemap.append("</urlset>")
    changed += write_if_changed(ROOT / "sitemap.xml", "\n".join(sitemap) + "\n")

    # _headers（Cloudflare Pages / Netlify 兼容格式；哈希资产不可变缓存 + 安全头）
    headers = (
        "# FreshLife 静态站点安全头与缓存策略\n"
        "# 哈希资产不可变缓存；站点页面默认不缓存（由托管平台处理）\n"
        "/\n"
        "  X-Content-Type-Options: nosniff\n"
        "  X-Frame-Options: SAMEORIGIN\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: geolocation=(), microphone=(), camera=(), usb=()\n"
        "/assets/*\n"
        "  Cache-Control: public, max-age=31536000, immutable\n"
    )
    changed += write_if_changed(ROOT / "_headers", headers)

    # BUILD_PROVENANCE.txt
    provenance = (
        "FreshLife 官网构建产物\n"
        "=====================\n"
        "Source: site/ (templates, partials, content, styles, scripts) + scripts/build.py\n"
        "Build date: %s\n"
        "Command: python3 scripts/build.py\n"
        "CSS: assets/%s\n"
        "JS:  assets/%s\n"
        "Checksum (index.html, sha256): %s\n"
        % (now.strftime("%Y-%m-%dT%H:%M:%SZ"), css_name, js_name,
           hashlib.sha256(index_html.encode("utf-8")).hexdigest())
    )
    changed += write_if_changed(ROOT / "BUILD_PROVENANCE.txt", provenance)

    print("[build] 完成。")
    print("  页面: index.html / features/ / privacy/ / terms/ / support/ / safety/ / 404.html")
    print("  资产: assets/%s, assets/%s" % (css_name, js_name))
    if removed:
        print("  已清理旧产物: %s" % ", ".join(removed))
    print("  变更文件数: %d" % changed)
    print("[build] 校验通过 ✓")


def validate(docs, expected_files):
    """校验：内部链接存在、锚点 id 存在、无未替换占位符。"""
    errors = []
    for name, html in docs:
        ids = set(re.findall(r'id="([^"]+)"', html))
        leftover = re.findall(r"\{\{[a-z_]+\}\}", html)
        if leftover:
            errors.append("%s: 未替换占位符 %s" % (name, sorted(set(leftover))))

        # 相对路径链接与站内链接
        for href in re.findall(r'href="([^"]+)"', html):
            if href.startswith(("http://", "https://", "mailto:", "tel:", "data:")):
                continue
            if href.startswith("#"):
                if href[1:] and href[1:] not in ids:
                    errors.append("%s: 页内锚点不存在 #%s" % (name, href[1:]))
                continue
            if href.startswith("/"):
                target = href.split("#")[0].lstrip("/") or "index.html"
                if target.endswith("/"):
                    target = target + "index.html"
                if target not in expected_files:
                    errors.append("%s: 链接目标不存在 %s" % (name, href))
    return errors


if __name__ == "__main__":
    main()
