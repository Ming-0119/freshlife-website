#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FreshLife 官网构建脚本（零依赖，仅 Python 标准库）

用法：
    python3 scripts/build.py [--check-only]

职责：
  1. 从 site/templates（含共享 partial）+ site/content 渲染中英双语页面到仓库根目录
     （中文在根目录，英文在 /en/ 下；GitHub → 阿里云静态托管可直接使用根目录内容）；
  2. 将 CSS/JS 以内容哈希文件名输出到 assets/（配合 _headers 的
     immutable 缓存规则，发布滚动安全）；
  3. 生成 robots.txt / sitemap.xml（含 hreflang 交替链接）/ _headers / BUILD_PROVENANCE.txt；
  4. 清理上一次构建遗留的旧产物（.vite/、旧 assets 等）；
  5. 构建后自检：内部链接、锚点 id、canonical/hreflang、未替换占位符。

页面（中文）：index / features / philosophy / privacy / terms / support / safety / 404
页面（英文）：/en/ 及 /en/features/、/en/philosophy/、/en/privacy/、/en/terms/、
             /en/support/、/en/safety/（结构独立，文案自然英文，非逐字翻译）
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
CONTENT_EN = CONTENT / "en"
STATIC = SITE / "static"
STYLES = SITE / "styles"
SCRIPTS = SITE / "scripts"
ASSETS = ROOT / "assets"

CONFIG = json.loads((SITE / "config.json").read_text(encoding="utf-8"))
CONFIG_EN = json.loads((SITE / "config.en.json").read_text(encoding="utf-8"))
FEATURES = json.loads((CONTENT / "features.json").read_text(encoding="utf-8"))
FEATURES_EN = json.loads((CONTENT_EN / "features.json").read_text(encoding="utf-8"))

DOMAIN = CONFIG["site"]["domain"]

# 中英页面对（canonical / hreflang / 语言切换用）
PAGE_PAIRS = {
    "index": ("/", "/en/"),
    "features": ("/features/", "/en/features/"),
    "philosophy": ("/philosophy/", "/en/philosophy/"),
    "privacy": ("/privacy/", "/en/privacy/"),
    "terms": ("/terms/", "/en/terms/"),
    "support": ("/support/", "/en/support/"),
    "safety": ("/safety/", "/en/safety/"),
}

# 语言相关的界面文案（模板与 partial 中的中文/英文从这里注入）
LANG_STRINGS = {
    "zh": {
        "html_lang": "zh-CN",
        "skip_text": "跳到主要内容",
        "brand_aria": "FreshLife 首页",
        "nav_aria": "主导航",
        "mobile_nav_aria": "移动端导航",
        "toggle_aria": "打开菜单",
        "theme_label": "夜间",
        "theme_aria": "切换到夜间模式",
        "theme_mobile_label": "切换到夜间模式",
        "theme_mobile_aria": "切换到夜间模式",
        "footer_tagline": "从家里已有的食材出发，让每天吃什么更轻松，也少一点浪费。",
        "col_product": "产品",
        "col_support": "支持",
        "col_status": "状态说明",
        "status_launch": ("上线状态", "/features/#status"),
        "status_features": ("功能清单与状态", "/#features"),
        "status_roadmap": ("接下来的路", "/#roadmap"),
        "developer_prefix": "开发者与运营者：",
        "sitemap_label": "站点地图",
        "back_text": "返回首页",
        "nf_title": "这个页面不存在或已被移动。",
        "nf_desc": "你访问的地址可能拼写有误，或对应内容已经调整。可以返回首页、了解我们的理念，或看看完整功能。",
        "nf_home": "返回首页",
        "nf_features": "查看完整功能",
        "nf_philosophy": "了解我们的理念",
        "nf_footer": "FreshLife 首页",
    },
    "en": {
        "html_lang": "en",
        "skip_text": "Skip to main content",
        "brand_aria": "FreshLife home",
        "nav_aria": "Main navigation",
        "mobile_nav_aria": "Mobile navigation",
        "toggle_aria": "Open menu",
        "theme_label": "Night",
        "theme_aria": "Switch to dark mode",
        "theme_mobile_label": "Switch to dark mode",
        "theme_mobile_aria": "Switch to dark mode",
        "footer_tagline": "Start with what is already at home, make daily food decisions easier, and waste a little less.",
        "col_product": "Product",
        "col_support": "Support",
        "col_status": "Status",
        "status_launch": ("Launch status", "/en/features/#status"),
        "status_features": ("Feature list & status", "/en/#features"),
        "status_roadmap": ("What’s next", "/en/#roadmap"),
        "developer_prefix": "Developer & operator: ",
        "sitemap_label": "Sitemap",
        "back_text": "Back to home",
        "nf_title": "This page doesn’t exist or has moved.",
        "nf_desc": "The address may be mistyped, or the page has moved. Head back to the homepage, read our philosophy, or browse all features.",
        "nf_home": "Back to home",
        "nf_features": "All features",
        "nf_philosophy": "Our philosophy",
        "nf_footer": "FreshLife home",
    },
}

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
    # 每日场景：日出（早晨）与购物篮（超市）
    "sunrise": '<circle cx="12" cy="13.5" r="4"/><path d="M12 3.5v2M5.3 5.3l1.4 1.4M3 13.5h2M19 13.5h2M17.3 6.7l-1.4 1.4M4.5 19.5h15M8.5 16.5h7"/>',
    "basket": '<path d="M4 9h16l-1.6 10.5a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3L4 9z"/><path d="M8 9l3-5.5M16 9l-3-5.5"/><path d="M9.5 13v4M12 13v4M14.5 13v4"/>',
}

# 首页专用的 Open Graph 标签（其余页面只输出 canonical + hreflang）
INDEX_OG = {
    "zh": (
        '<meta property="og:type" content="website"/>\n'
        '<meta property="og:locale" content="zh_CN"/>\n'
        '<meta property="og:url" content="https://www.freshlifeapp.cn/"/>\n'
        '<meta property="og:title" content="FreshLife — 每天吃什么，不必每次从头想"/>\n'
        '<meta property="og:description" content="本地优先的家庭食品决策助手：库存、临期提醒、餐食规划与购物清单。iPhone 与 iPad 通用，无需注册账号。"/>\n'
        '<meta property="og:image" content="https://www.freshlifeapp.cn/og-image.png"/>\n'
        '<meta property="og:image:width" content="1200"/>\n'
        '<meta property="og:image:height" content="630"/>\n'
        '<meta property="og:image:alt" content="FreshLife — 每天吃什么，不必每次从头想"/>\n'
        '<meta name="twitter:card" content="summary_large_image"/>\n'
        '<meta name="twitter:title" content="FreshLife — 每天吃什么，不必每次从头想"/>\n'
        '<meta name="twitter:description" content="本地优先的家庭食品决策助手，适用于 iPhone 与 iPad。"/>\n'
        '<meta name="twitter:image" content="https://www.freshlifeapp.cn/og-image.png"/>'
    ),
    "en": (
        '<meta property="og:type" content="website"/>\n'
        '<meta property="og:locale" content="en_US"/>\n'
        '<meta property="og:url" content="https://www.freshlifeapp.cn/en/"/>\n'
        '<meta property="og:title" content="FreshLife — What should we eat today?"/>\n'
        '<meta property="og:description" content="A local-first helper for daily food decisions: what’s in your kitchen, what’s expiring, what to cook, and what to buy. iPhone and iPad, no account needed."/>\n'
        '<meta property="og:image" content="https://www.freshlifeapp.cn/og-image-en.png"/>\n'
        '<meta property="og:image:width" content="1200"/>\n'
        '<meta property="og:image:height" content="630"/>\n'
        '<meta property="og:image:alt" content="FreshLife — What should we eat today? Don’t start from scratch."/>\n'
        '<meta name="twitter:card" content="summary_large_image"/>\n'
        '<meta name="twitter:title" content="FreshLife — What should we eat today?"/>\n'
        '<meta name="twitter:description" content="A local-first food decision helper for iPhone and iPad."/>\n'
        '<meta name="twitter:image" content="https://www.freshlifeapp.cn/og-image-en.png"/>'
    ),
}

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

def apply(tpl, subs):
    for key, value in subs.items():
        tpl = tpl.replace("{{" + key + "}}", value)
    return tpl


def render_template(tpl_name, subs):
    tpl = (TEMPLATES / tpl_name).read_text(encoding="utf-8")
    # 统一为一个结尾换行，避免 partial 自带换行造成构建产物出现空白尾行。
    return apply(tpl, subs).rstrip() + "\n"


def theme_toggle(cls="", id_suffix="", aria_label="切换到夜间模式", label="夜间"):
    tpl = partial("_theme_toggle.html")
    return (
        tpl.replace("{{cls}}", cls)
        .replace("{{id_suffix}}", id_suffix)
        .replace("{{aria_label}}", esc(aria_label))
        .replace("{{label}}", esc(label))
    )


def build_head(title, description, css_tag, html_lang="zh-CN", canonical="",
               hreflang="", robots="index, follow", og_tags=""):
    tpl = partial("_head.html")
    canonical_tag = '<link rel="canonical" href="%s"/>' % esc(canonical) if canonical else ""
    return (
        tpl.replace("{{title}}", esc(title))
        .replace("{{description}}", esc(description))
        .replace("{{html_lang}}", esc(html_lang))
        .replace("{{canonical}}", canonical_tag)
        .replace("{{hreflang}}", hreflang or "")
        .replace("{{robots}}", esc(robots))
        .replace("{{og_tags}}", og_tags)
        .replace("{{css}}", css_tag)
    )


def hreflang_tags(zh_path, en_path):
    return (
        '<link rel="alternate" hreflang="zh-CN" href="%s%s"/>\n'
        '<link rel="alternate" hreflang="en" href="%s%s"/>\n'
        '<link rel="alternate" hreflang="x-default" href="%s%s"/>'
        % (DOMAIN, zh_path, DOMAIN, en_path, DOMAIN, zh_path)
    )


def lang_switch(page_key, lang, mobile=False):
    """对应页面的语言切换链接：中文页 → English，英文页 → 中文。"""
    if page_key in PAGE_PAIRS:
        zh_path, en_path = PAGE_PAIRS[page_key]
    else:
        zh_path, en_path = "/", "/en/"
    if lang == "zh":
        href, hreflang, text, elang = en_path, "en", "English", "en"
    else:
        href, hreflang, text, elang = zh_path, "zh-CN", "中文", "zh-CN"
    cls = "lang-switch" + (" lang-switch--mobile" if mobile else "")
    return '<a class="%s" href="%s" hreflang="%s" lang="%s">%s</a>' % (
        cls, esc(href), hreflang, elang, esc(text))


def build_site_header(nav_html, nav_mobile_html, lang, page_key,
                      cta_href="/features/", cta_label="查看完整功能"):
    L = LANG_STRINGS[lang]
    tpl = partial("_site_header.html")
    return apply(tpl, {
        "skip_text": L["skip_text"],
        "home_href": "/" if lang == "zh" else "/en/",
        "brand_aria": L["brand_aria"],
        "nav_aria": L["nav_aria"],
        "toggle_aria": L["toggle_aria"],
        "mobile_nav_aria": L["mobile_nav_aria"],
        "nav": nav_html,
        "nav_mobile": nav_mobile_html,
        "lang_switch": lang_switch(page_key, lang),
        "lang_switch_mobile": lang_switch(page_key, lang, mobile=True),
        "theme_toggle": theme_toggle(aria_label=L["theme_aria"], label=L["theme_label"]),
        "theme_toggle_mobile": theme_toggle(
            cls=" theme-toggle--mobile",
            id_suffix="-mobile",
            aria_label=L["theme_mobile_aria"],
            label=L["theme_mobile_label"],
        ),
        "nav_cta_href": esc(cta_href),
        "nav_cta_label": esc(cta_label),
    })


def build_site_footer(product_links, legal_links, year, developer, js_tag, lang):
    L = LANG_STRINGS[lang]
    tpl = partial("_site_footer.html")
    launch, launch_href = L["status_launch"]
    feat, feat_href = L["status_features"]
    road, road_href = L["status_roadmap"]
    return apply(tpl, {
        "footer_tagline": L["footer_tagline"],
        "col_product": L["col_product"],
        "col_support": L["col_support"],
        "col_status": L["col_status"],
        "footer_product": product_links,
        "footer_legal": legal_links,
        "status_launch": esc(launch),
        "status_launch_href": esc(launch_href),
        "status_features": esc(feat),
        "status_features_href": esc(feat_href),
        "status_roadmap": esc(road),
        "status_roadmap_href": esc(road_href),
        "year": year,
        "developer_line": L["developer_prefix"] + developer,
        "footer_utility_aria": "页脚辅助导航" if lang == "zh" else "Footer utility navigation",
        "footer_language_href": "/en/" if lang == "zh" else "/",
        "footer_language_hreflang": "en" if lang == "zh" else "zh-CN",
        "footer_language_label": "English" if lang == "zh" else "简体中文",
        "safety_href": "/safety/" if lang == "zh" else "/en/safety/",
        "safety_label": "安全与透明度" if lang == "zh" else "Safety & Transparency",
        "sitemap_label": L["sitemap_label"],
        "js": js_tag,
    })


def build_nav(cfg):
    links = []
    for item in cfg["nav"]:
        links.append('<a href="%s">%s</a>' % (esc(item["href"]), esc(item["label"])))
    return "\n".join(links)


def build_nav_mobile(cfg):
    links = []
    for item in cfg["nav"]:
        links.append(
            '<a href="%s">%s<small>FreshLife</small></a>'
            % (esc(item["href"]), esc(item["label"]))
        )
    cta = cfg.get("mobileCta", {"href": "/features/", "label": "查看完整功能", "hint": "完整功能与上线状态"})
    links.append('<a href="%s">%s<small>%s</small></a>'
                 % (esc(cta["href"]), esc(cta["label"]), esc(cta["hint"])))
    return "\n".join(links)


def build_footer_links(cfg, key):
    return "\n".join(
        '<a href="%s">%s</a>' % (esc(i["href"]), esc(i["label"]))
        for i in cfg["footer" + key]
    )


def build_badge(features, key, label=None):
    meta = {m["key"]: m for m in features["statusLegend"]}
    text = label or meta[key]["label"]
    return '<span class="badge %s">%s</span>' % (esc(key), esc(text))


def build_legend(features, with_hints=True):
    items = []
    for m in features["statusLegend"]:
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


def build_why(features):
    out = []
    for w in features["why"]:
        out.append(
            '<div class="why-card reveal">'
            '<div class="ico">%s</div>'
            "<h3>%s</h3><p>%s</p></div>"
            % (icon(w["icon"]), esc(w["title"]), esc(w["desc"]))
        )
    return "\n".join(out)


def build_daily_scenarios(features):
    out = []
    for d in features["dailyScenarios"]:
        out.append(
            '<a class="daily-card reveal" href="%s">'
            '<div class="top"><div class="ico">%s</div>'
            '<span class="when">%s</span></div>'
            '<h3>%s</h3><p>%s</p>'
            '<span class="daily-card-cta">%s <span aria-hidden="true">→</span></span></a>'
            % (esc(d["href"]), icon(d["icon"]), esc(d["when"]),
               esc(d["title"]), esc(d["desc"]), esc(d["cta"]))
        )
    return "\n".join(out)


def build_vision_cards(features):
    out = []
    for v in features["visionCards"]:
        out.append(
            '<div class="vision-card reveal">'
            '<div class="top"><div class="ico">%s</div>'
            '<span class="vision-tag %s">%s</span></div>'
            "<h3>%s</h3><p>%s</p></div>"
            % (icon(v["icon"]), esc(v["tag"]), esc(v["tagLabel"]),
               esc(v["title"]), esc(v["desc"]))
        )
    return "\n".join(out)


def build_add_methods(features):
    out = []
    for m in features["addMethods"]:
        out.append(
            '<div class="method-card reveal">'
            '<div class="top"><div class="ico">%s</div>%s</div>'
            "<h3>%s</h3><p class=\"desc\">%s</p>"
            '<p class="flow">%s</p>'
            '<p class="note">%s</p></div>'
            % (icon(m["icon"]), build_badge(features, m["status"]),
               esc(m["title"]), esc(m["desc"]),
               esc(m["flow"]), esc(m["note"]))
        )
    return "\n".join(out)


def build_ai_modes(features):
    out = []
    for m in features["aiModes"]:
        out.append(
            '<div class="ai-card reveal">'
            '<div class="ico">%s</div><h3>%s %s</h3>'
            '<p class="desc">%s</p></div>'
            % (icon(m["icon"]), esc(m["title"]),
               build_badge(features, m["status"]), esc(m["desc"]))
        )
    return "\n".join(out)


def build_privacy_points(features):
    out = []
    # 首页只保留最关键的四点，完整边界交给隐私与安全页面，避免首页信息过载。
    points = features["privacyPoints"]
    for p in [points[i] for i in (0, 1, 2, 4) if i < len(points)]:
        out.append(
            '<div class="privacy-item reveal">'
            '<div class="ico">%s</div>'
            "<div><h3>%s</h3><p>%s</p></div></div>"
            % (icon(p["icon"]), esc(p["title"]), esc(p["desc"]))
        )
    return "\n".join(out)


def build_feature_glance(features, lang="zh"):
    """首页功能速览：只给足判断信息，完整解释留在功能页。"""
    anchors = ("pantry", "add", "meals", "devices")
    icons = ("fridge", "camera", "fork", "shield")
    base = "/features/" if lang == "zh" else "/en/features/"
    cta = "查看这一类" if lang == "zh" else "Explore this area"
    out = []
    for i, g in enumerate(features["featureGroups"][:4]):
        items = "".join(
            '<li><span>%s</span>%s</li>'
            % (esc(item["name"]), build_badge(features, item["status"]))
            for item in g["items"][:2]
        )
        out.append(
            '<a class="feature-glance-card reveal" href="%s#%s">'
            '<span class="feature-glance-number">%02d</span>'
            '<span class="ico">%s</span><h3>%s</h3><ul>%s</ul>'
            '<span class="feature-glance-cta">%s <span aria-hidden="true">→</span></span></a>'
            % (base, anchors[i], i + 1, icon(icons[i]), esc(g["group"]), items, cta)
        )
    return "\n".join(out)


def build_roadmap_compact(features):
    """首页只展示最接近用户的三步方向；长期生态留在独立理念页。"""
    out = []
    for r in features["roadmap"][:3]:
        out.append(
            '<div class="roadmap-rail-step reveal">'
            '<span class="roadmap-rail-number">%s</span>'
            '<span class="ico">%s</span><h3>%s</h3><p>%s</p></div>'
            % (esc(r["phase"]), icon(r["icon"]), esc(r["title"]), esc(r["desc"]))
        )
    return "\n".join(out)


def build_feature_groups(features):
    out = []
    for g in features["featureGroups"]:
        rows = []
        for item in g["items"]:
            rows.append(
                '<div class="feature-row"><b>%s</b>'
                '<span class="fd">%s</span>%s</div>'
                % (esc(item["name"]), esc(item["desc"]),
                   build_badge(features, item["status"]))
            )
        out.append(
            '<div class="feature-group reveal"><h3>%s</h3>'
            '<div class="feature-table">%s</div></div>'
            % (esc(g["group"]), "\n".join(rows))
        )
    return "\n".join(out)


def build_roadmap(features):
    """路线图：五阶段，按「更轻松的录入 → 家庭节奏 → 更好的规划与补货 →
    安全的家庭协作 → 生态连接」排序；每张卡片都标注「在计划里」。"""
    out = []
    planned_label = next(
        (m["label"] for m in features["statusLegend"] if m["key"] == "planned"),
        "在计划里",
    )
    for r in features["roadmap"]:
        items = "".join("<li>%s</li>" % esc(i) for i in r.get("items", []))
        out.append(
            '<div class="roadmap-card reveal">'
            '<span class="roadmap-step">%s</span>'
            '<div class="roadmap-body">'
            '<h3><span class="ico">%s</span>%s'
            '<span class="flag">%s</span></h3>'
            '<p>%s</p>'
            '<ul class="roadmap-items">%s</ul></div></div>'
            % (esc(r["phase"]), icon(r["icon"]), esc(r["title"]),
               esc(planned_label), esc(r["desc"]), items)
        )
    return "\n".join(out)


def build_faq(features):
    out = []
    for i, item in enumerate(features["faq"]):
        out.append(
            "<details%s>"
            '<summary>%s<span class="plus" aria-hidden="true"></span></summary>'
            '<div class="a"><p>%s</p></div></details>'
            % (' open' if i == 0 else "", esc(item["q"]), esc(item["a"]))
        )
    return "\n".join(out)


def build_tab_switch_buttons(features):
    out = []
    for i, t in enumerate(features["fiveTabs"]):
        selected = ' aria-selected="true"' if i == 0 else ' aria-selected="false"'
        out.append(
            '<button role="tab" data-target="%s"%s aria-controls="mock-%s">%s</button>'
            % (esc(t["id"]), selected, esc(t["id"]), esc(t["name"]))
        )
    return "\n".join(out)


def build_tab_points_initial(features):
    t = features["fiveTabs"][0]
    return "".join(
        '<li>%s<span>%s</span></li>' % (icon("check"), esc(p)) for p in t["points"]
    )


def build_tab_points_json(features):
    data = {t["id"]: t["points"] for t in features["fiveTabs"]}
    return json.dumps(data, ensure_ascii=False)


# --------------------------------------------------------------------------
# 单语言渲染
# --------------------------------------------------------------------------

def render_lang(lang, cfg, features, content_dir, css_tag, js_tag):
    """渲染一种语言的全部页面，返回 (docs, pages)。
    docs: [(显示名, html)] 用于自检；pages: {相对路径, html} 用于写入。"""
    is_zh = lang == "zh"
    site = cfg["site"]
    L = LANG_STRINGS[lang]
    year = str(site["copyrightYear"])
    developer = esc(site["developer"])

    nav_html = build_nav(cfg)
    nav_mobile_html = build_nav_mobile(cfg)
    footer_product = build_footer_links(cfg, "ProductLinks")
    footer_legal = build_footer_links(cfg, "LegalLinks")

    docs, pages = [], {}

    def page_head(key, robots="index, follow", og_tags=""):
        zh_path, en_path = PAGE_PAIRS[key]
        meta = cfg["pages"][key]
        canonical = DOMAIN + (zh_path if is_zh else en_path)
        return build_head(
            meta["title"], meta["description"], css_tag,
            html_lang=L["html_lang"], canonical=canonical,
            hreflang=hreflang_tags(zh_path, en_path),
            robots=robots, og_tags=og_tags,
        )

    def add_page(key, path, html):
        pages[path] = html
        docs.append((path, html))

    # ---- 首页 ----
    index_tpl = "index.html" if is_zh else "index_en.html"
    index_meta = cfg["pages"]["index"]
    index_subs = {
        "head": page_head("index", og_tags=INDEX_OG[lang]),
        "header": build_site_header(
            nav_html, nav_mobile_html, lang, "index",
            cta_href="/features/" if is_zh else "/en/features/",
            cta_label="查看完整功能" if is_zh else "All features"),
        "footer": build_site_footer(
            footer_product, footer_legal, year, developer, js_tag, lang),
        "mock_screens": (content_dir / "mock_screens.html").read_text(encoding="utf-8"),
        "mock_ipad": (content_dir / "mock_ipad.html").read_text(encoding="utf-8"),
        "tab_points_json": build_tab_points_json(features),
        "tab_switch_buttons": build_tab_switch_buttons(features),
        "tab_points_initial": build_tab_points_initial(features),
        "why_cards": build_why(features),
        "daily_cards": build_daily_scenarios(features),
        "vision_cards": build_vision_cards(features),
        "add_methods": build_add_methods(features),
        "ai_modes": build_ai_modes(features),
        "privacy_points": build_privacy_points(features),
        "feature_glance": build_feature_glance(features, lang),
        "roadmap_compact": build_roadmap_compact(features),
        "legend": build_legend(features, with_hints=True),
        "legend_inline": build_legend(features, with_hints=False),
        "feature_groups": build_feature_groups(features),
        "roadmap_phases": build_roadmap(features),
        "faq": build_faq(features),
    }
    add_page("index", index_meta["path"], render_template(index_tpl, index_subs))

    # ---- 完整功能页 ----
    feat_meta = cfg["pages"]["features"]
    feat_subs = {
        "head": page_head("features"),
        "header": build_site_header(
            nav_html, nav_mobile_html, lang, "features",
            cta_href="/features/#status" if is_zh else "/en/features/#status",
            cta_label="了解上线状态" if is_zh else "See launch status"),
        "footer": build_site_footer(
            footer_product, footer_legal, year, developer, js_tag, lang),
        "features_content": (content_dir / "features_page.html").read_text(encoding="utf-8"),
    }
    add_page("features", feat_meta["path"], render_template("features.html", feat_subs))

    # ---- 理念页 ----
    philo_meta = cfg["pages"]["philosophy"]
    philo_subs = {
        "head": page_head("philosophy"),
        "header": build_site_header(
            nav_html, nav_mobile_html, lang, "philosophy",
            cta_href="/features/" if is_zh else "/en/features/",
            cta_label="查看完整功能" if is_zh else "All features"),
        "footer": build_site_footer(
            footer_product, footer_legal, year, developer, js_tag, lang),
        "content": (content_dir / "philosophy.html").read_text(encoding="utf-8"),
    }
    add_page("philosophy", philo_meta["path"], render_template("philosophy.html", philo_subs))

    # ---- 法律 / 支持页 ----
    for key in ("privacy", "terms", "support", "safety"):
        meta = cfg["pages"][key]
        content = (content_dir / meta["content"]).read_text(encoding="utf-8")
        content = content.replace("{{developer}}", developer)
        legal_subs = {
            "head": page_head(key),
            "skip_text": L["skip_text"],
            "home_href": "/" if is_zh else "/en/",
            "nav_aria": L["nav_aria"],
            "lang_switch": lang_switch(key, lang),
            "theme_toggle": theme_toggle(aria_label=L["theme_aria"], label=L["theme_label"]),
            "back_text": L["back_text"],
            "content": content,
            "year": year,
            "developer_line": L["developer_prefix"] + developer,
            "footer_links": ('<a href="/sitemap.xml">%s</a> · %s'
                             % (esc(L["sitemap_label"]), lang_switch(key, lang))),
            "js": js_tag,
        }
        add_page(key, meta["path"], render_template("legal.html", legal_subs))

    return docs, pages


# --------------------------------------------------------------------------
# 主构建
# --------------------------------------------------------------------------

def main():
    check_only = "--check-only" in sys.argv
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    if check_only:
        print("[build] 校验模式：仅检查现有产物")
    else:
        print("[build] 开始构建 FreshLife 官网（中英双语）…")

    # ---- 资产哈希 ----
    css_raw = (STYLES / "main.css").read_text(encoding="utf-8")
    js_raw = (SCRIPTS / "main.js").read_text(encoding="utf-8")
    css_name = "main-%s.css" % hash_file(STYLES / "main.css")
    js_name = "main-%s.js" % hash_file(SCRIPTS / "main.js")
    css_tag = '<link rel="stylesheet" href="/assets/%s"/>' % css_name
    js_tag = '<script src="/assets/%s" defer></script>' % js_name

    # ---- 渲染两种语言 ----
    zh_docs, zh_pages = render_lang("zh", CONFIG, FEATURES, CONTENT, css_tag, js_tag)
    en_docs, en_pages = render_lang("en", CONFIG_EN, FEATURES_EN, CONTENT_EN, css_tag, js_tag)

    # ---- 404（单一文件，中文为主，含英文入口） ----
    L = LANG_STRINGS["zh"]
    nf_meta = CONFIG["pages"]["notfound"]
    nf_subs = {
        "head": build_head(nf_meta["title"], nf_meta["description"], css_tag,
                           robots="noindex, follow"),
        "brand_aria": L["brand_aria"],
        "lang_switch": lang_switch("notfound", "zh"),
        "theme_toggle": theme_toggle(aria_label=L["theme_aria"], label=L["theme_label"]),
        "nav_cta_href": "/features/",
        "nav_cta_label": "查看完整功能",
        "nf_title": L["nf_title"],
        "nf_desc": L["nf_desc"],
        "nf_home": L["nf_home"],
        "nf_features": L["nf_features"],
        "nf_philosophy": L["nf_philosophy"],
        "nf_footer": L["nf_footer"],
        "year": str(CONFIG["site"]["copyrightYear"]),
        "js": js_tag,
    }
    notfound_html = render_template("404.html", nf_subs)

    # ---- 自检（在任何写入之前先校验渲染结果） ----
    expected = {
        "index.html",
        "features/index.html",
        "philosophy/index.html",
        "privacy/index.html",
        "terms/index.html",
        "support/index.html",
        "safety/index.html",
        "en/index.html",
        "en/features/index.html",
        "en/philosophy/index.html",
        "en/privacy/index.html",
        "en/terms/index.html",
        "en/support/index.html",
        "en/safety/index.html",
        "404.html",
        "robots.txt",
        "sitemap.xml",
        "app-icon.png",
        "android-family-101.png",
        "android-privacy-101.png",
        "favicon-64.png",
        "favicon.ico",
        "apple-touch-icon.png",
        "og-image.png",
        "og-image-en.png",
        "assets/" + css_name,
        "assets/" + js_name,
    }
    docs = zh_docs + en_docs + [("404.html", notfound_html)]
    errors = validate(docs, expected)
    if errors:
        print("\n[build] 校验失败：")
        for e in errors:
            print("  ✗", e)
        sys.exit(1)

    if check_only:
        print("[build] 校验通过 ✓（未写入任何文件）")
        return

    # ---- 静态文件 ----
    def copy_static(name):
        write_if_changed(ROOT / name, (STATIC / name).read_bytes())

    # ---- 写入 ----
    changed = 0
    for path, html in list(zh_pages.items()) + list(en_pages.items()):
        changed += write_if_changed(ROOT / path, html)
    changed += write_if_changed(ROOT / "404.html", notfound_html)
    copy_static("app-icon.png")
    copy_static("android-family-101.png")
    copy_static("android-privacy-101.png")
    copy_static("favicon-64.png")
    copy_static("favicon.ico")
    copy_static("apple-touch-icon.png")
    copy_static("og-image.png")
    copy_static("og-image-en.png")

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
    for stray in ("file.svg", "globe.svg", "window.svg", "favicon.svg"):
        p = ROOT / stray
        if p.exists():
            p.unlink()
            removed.append(stray)

    # robots.txt
    robots = (
        "User-Agent: *\n"
        "Allow: /\n\n"
        "Sitemap: %s/sitemap.xml\n"
        "Host: %s\n" % (DOMAIN, DOMAIN)
    )
    changed += write_if_changed(ROOT / "robots.txt", robots)

    # sitemap.xml（含 hreflang 交替链接）
    order = ["index", "features", "philosophy", "privacy", "terms", "support", "safety"]
    freqs = {"index": "weekly", "features": "weekly", "philosophy": "monthly",
             "privacy": "monthly", "terms": "monthly", "support": "monthly",
             "safety": "monthly"}
    prios = {"index": "1.0", "features": "0.9", "philosophy": "0.8",
             "privacy": "0.7", "terms": "0.7", "support": "0.7", "safety": "0.7"}
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
               'xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for key in order:
        zh_path, en_path = PAGE_PAIRS[key]
        sitemap.append("<url>")
        sitemap.append("<loc>%s%s</loc>" % (DOMAIN, zh_path))
        sitemap.append("<lastmod>%s</lastmod>" % today)
        sitemap.append("<changefreq>%s</changefreq>" % freqs[key])
        sitemap.append("<priority>%s</priority>" % prios[key])
        sitemap.append('<xhtml:link rel="alternate" hreflang="zh-CN" href="%s%s"/>' % (DOMAIN, zh_path))
        sitemap.append('<xhtml:link rel="alternate" hreflang="en" href="%s%s"/>' % (DOMAIN, en_path))
        sitemap.append('<xhtml:link rel="alternate" hreflang="x-default" href="%s%s"/>' % (DOMAIN, zh_path))
        sitemap.append("</url>")
        sitemap.append("<url>")
        sitemap.append("<loc>%s%s</loc>" % (DOMAIN, en_path))
        sitemap.append("<lastmod>%s</lastmod>" % today)
        sitemap.append("<changefreq>%s</changefreq>" % freqs[key])
        sitemap.append("<priority>%s</priority>" % prios[key])
        sitemap.append('<xhtml:link rel="alternate" hreflang="zh-CN" href="%s%s"/>' % (DOMAIN, zh_path))
        sitemap.append('<xhtml:link rel="alternate" hreflang="en" href="%s%s"/>' % (DOMAIN, en_path))
        sitemap.append('<xhtml:link rel="alternate" hreflang="x-default" href="%s%s"/>' % (DOMAIN, zh_path))
        sitemap.append("</url>")
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
        "Pages: zh (root) + en (/en/) × 7\n"
        "Checksum (index.html, sha256): %s\n"
        % (now.strftime("%Y-%m-%dT%H:%M:%SZ"), css_name, js_name,
           hashlib.sha256(zh_pages["index.html"].encode("utf-8")).hexdigest())
    )
    changed += write_if_changed(ROOT / "BUILD_PROVENANCE.txt", provenance)

    print("[build] 完成。")
    print("  页面: index / features / philosophy / privacy / terms / support / safety / 404")
    print("  English: /en/ /en/features/ /en/philosophy/ /en/privacy/ /en/terms/ /en/support/ /en/safety/")
    print("  资产: assets/%s, assets/%s" % (css_name, js_name))
    if removed:
        print("  已清理旧产物: %s" % ", ".join(removed))
    print("  变更文件数: %d" % changed)
    print("[build] 校验通过 ✓")


def validate(docs, expected_files):
    """校验：内部链接存在、锚点 id 存在、canonical/hreflang 成对、无未替换占位符。"""
    errors = []
    for name, html in docs:
        ids = set(re.findall(r'id="([^"]+)"', html))
        leftover = re.findall(r"\{\{[a-z_]+\}\}", html)
        if leftover:
            errors.append("%s: 未替换占位符 %s" % (name, sorted(set(leftover))))

        # canonical 必须与 hreflang 成对出现（404 除外）
        if name != "404.html":
            if "rel=\"canonical\"" not in html:
                errors.append("%s: 缺少 canonical" % name)
            if "hreflang=\"zh-CN\"" not in html or "hreflang=\"en\"" not in html:
                errors.append("%s: 缺少 hreflang 交替链接" % name)

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
