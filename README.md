# FreshLife 官网

FreshLife（保质期管理与餐食规划）的官方产品网站。中文优先、移动端优先、本地优先，设计语言与 App 内 `FreshLifeProductStyle` / `FreshTheme` 对齐。

- 域名：<https://www.freshlifeapp.cn>
- 部署：GitHub → 阿里云静态托管，**仓库根目录即部署产物**
- 语言：中文（根目录）+ 英文（`/en/` 下），中英页通过语言切换与 `hreflang` 互相指认
- 上线状态：App Store 准备中（未发布，网站只用「查看完整功能」「了解上线状态」等诚实 CTA）

## 仓库结构

```
scripts/build.py      构建脚本（仅 Python 标准库，零依赖）
scripts/verify-*.mjs  验证脚本（Node 内置 WebSocket + 本机 Chrome，profile 只在 /tmp）
site/
  config.json         中文站点元数据（域名、导航、页脚、页面清单）
  config.en.json      英文站点元数据（对应 /en/ 页面）
  templates/          页面骨架 + 共享 partial（_head/_site_header/_theme_toggle/_site_footer）
    index.html        中文首页骨架
    index_en.html     英文首页骨架（自然英文叙事，非逐字翻译）
    features.html     完整功能页骨架（中英共用）
    philosophy.html   理念页骨架（中英共用）
    legal.html        法律/支持页骨架（隐私、条款、帮助、安全共用）
    404.html          页面不存在（单一文件，中文为主，含英文入口）
  content/
    features.json     中文首页数据：五个核心页面、记录方式、流程、每日场景、
                      家庭节奏愿景、FreshLife AI、隐私、功能清单（含状态）、路线图、FAQ
    features_page.html 完整功能页正文（每项：能帮什么/怎么用/注意什么/当前状态）
    philosophy.html   理念页正文（相信什么 / 现在 / 下一步 / 长期方向 / 边界）
    mock_screens.html 手机演示的五屏界面（首页/库存/膳食/发现/我的）
    mock_ipad.html    iPad 演示（侧边栏五页）
    privacy.html      隐私政策正文（来源：App 工程 PRIVACY_POLICY.md）
    terms.html        使用条款正文（来源：App 工程 TERMS_OF_USE.md）
    support.html      帮助中心正文（来源：App 工程 SUPPORT.md）
    safety.html       安全与透明度正文
    en/               英文内容（features.json、features_page、philosophy、
                      mock 屏、privacy/terms/support/safety）
  styles/main.css     设计系统（令牌、组件、响应式、深浅色、无障碍、动效）
  scripts/main.js     交互（主题、移动导航、演示切换、滚动叙事、Tab 键盘、锚点焦点）
  static/             App 图标、favicon 与中英文社交分享图
assets/               构建产物：内容哈希命名的 CSS/JS（不可变缓存）
index.html …          构建生成的中文站点页面（勿直接手改）
en/ …                 构建生成的英文站点页面（勿直接手改）
```

## 构建

```bash
python3 scripts/build.py          # 构建到仓库根目录（中文 + /en/ 英文）
python3 scripts/build.py --check-only   # 只校验（不写文件）
make build                        # 等价于上面
make serve                        # 构建后本地预览 http://localhost:8080
```

构建脚本会自动：

1. 渲染中文 7 页（首页、完整功能、理念、隐私、条款、帮助、安全）+ 404，以及对应的
   `/en/` 英文 7 页（`/en/`、`/en/features/`、`/en/philosophy/`、`/en/privacy/`、
   `/en/terms/`、`/en/support/`、`/en/safety/`）；
2. 以内容哈希命名 CSS/JS 并输出到 `assets/`（配合 `_headers` 的 `immutable` 缓存规则，发布滚动安全）；
3. 生成 `robots.txt`、`sitemap.xml`（含 `hreflang` 交替链接）、`_headers`
   （安全响应头 + 缓存策略）、`BUILD_PROVENANCE.txt`；每个页面输出 `canonical` 与 `hreflang`；
4. 清理上一次构建遗留的旧产物（`.vite/`、旧哈希资产等）；
5. 自检：内部链接、页内锚点、canonical/hreflang 成对、未替换占位符。

> **修改内容请编辑 `site/` 下的源文件，不要直接改根目录生成文件。** 根目录文件每次构建都会被覆盖。

## 验证

```bash
make serve                         # 终端 1：本地预览
python3 scripts/verify-cdp.py      # 终端 2：交互/滚动叙事/主题/无障碍/布局
node scripts/verify-layout.mjs     # 视觉/布局/对比度/链接自检（可选）
```

验证使用系统临时目录 `/tmp` 存放浏览器 profile，不会污染仓库。
桌面端的四段滚动故事使用稳定的粘性舞台；手机端、无 JavaScript 和
`prefers-reduced-motion: reduce` 环境会自动退化成普通内容流，不接管系统滚动。

## 内容约定

- 中文站点文案优先；`/en/` 下是真正独立的英文页面（导航、按钮、ARIA、meta、正文均为英文），
  不是逐字翻译。中英页通过右上角语言切换与 `hreflang` 指向对应页面。
- 「功能清单」使用统一状态徽章，与 App 工程 `FreshProductionCapabilities`、
  `FreshLife_Feature_Map.md` 保持一致：
  - `现在就能用`（当前版本已提供）
  - `本机离线可用`（设备本地完成，无需联网）
  - `需要联网`（仅在主动使用时需要网络）
  - `在计划里`（不在当前版本，属于路线图）
- 理念页与首页「家庭节奏愿景」必须明确区分 **Current（现在已具备）**、
  **Next（下一阶段）**、**Long-term direction（长期方向）**；
  绝不暗示当前已具备长期家庭记忆、自动购物、完整家庭食品图谱或跨渠道自动录入。
- 路线图顺序固定为：更轻松的录入 → 家庭节奏与个性化上下文 → 更好的规划与补货 →
  安全的家庭协作 → 生态连接。
- 新增/修改功能状态时，先核对 App 工程的最新能力门控与版本，禁止夸大或写虚假上线状态。
- 远程 AI：当前发布版（1.0.0）未配置网关、未启用远程 AI；文案一律写「尚未启用，
  未来启用时默认关闭、需明确同意、只发送最少信息」，不写「默认开启」或夸大能力。
- 完整功能页每项功能按「能帮什么 — 怎么用 — 注意什么 — 当前状态」组织，
  规划（在计划里）与已上线内容严格分开。
- 不出现无法验证的节省金额、减废比例、评价、「第一/最佳」等表述；不把日期、营养、
  餐食或 AI 建议写成安全保证或医疗建议；权限说明用途、用到才请求。
- 不声称已取得未完成的备案、许可或审核；隐私政策保留「中国大陆发布说明」，
  运营主体、联系渠道与备案等事实确定后再更新。

## 发布

1. 编辑 `site/` 源文件；
2. `make build`；
3. 提交仓库根目录的生成产物（GitHub 触发同步到阿里云静态托管）。

## 本地预览

```bash
make serve
# 打开 http://localhost:8080（英文页 http://localhost:8080/en/）
```
