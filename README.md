# FreshLife 官网

FreshLife（保质期管理与餐食规划）的官方产品网站。中文优先、移动端优先、本地优先，设计语言与 App 内 `FreshLifeProductStyle` / `FreshTheme` 对齐。

- 域名：<https://www.freshlifeapp.cn>
- 部署：GitHub → 阿里云静态托管，**仓库根目录即部署产物**
- 上线状态：App Store 准备中（未发布，网站只用「查看完整功能」「了解上线状态」等诚实 CTA）

## 仓库结构

```
scripts/build.py      构建脚本（仅 Python 标准库，零依赖）
scripts/verify-*.mjs  验证脚本（Node 内置 WebSocket + 本机 Chrome，profile 只在 /tmp）
site/
  config.json         站点元数据（域名、导航、页脚、页面清单）
  templates/          页面骨架 + 共享 partial（_head/_site_header/_theme_toggle/_site_footer）
    index.html        首页骨架
    features.html     完整功能页骨架
    legal.html        法律/支持页骨架（隐私、条款、帮助、安全共用）
    404.html          页面不存在
  content/
    features.json     首页数据：五个核心页面、记录方式、流程、
                      FreshLife AI、隐私、功能清单（含状态）、愿景、FAQ
    features_page.html 完整功能页正文（每项：能帮什么/怎么用/注意什么/当前状态）
    mock_screens.html 手机演示的五屏界面（首页/库存/膳食/发现/我的）
    mock_ipad.html    iPad 演示（侧边栏五页）
    privacy.html      隐私政策正文（来源：App 工程 PRIVACY_POLICY.md）
    terms.html        使用条款正文（来源：App 工程 TERMS_OF_USE.md）
    support.html      帮助中心正文（来源：App 工程 SUPPORT.md）
    safety.html       安全与透明度正文
  styles/main.css     设计系统（令牌、组件、响应式、深浅色、无障碍、动效）
  scripts/main.js     交互（主题、移动导航、演示切换、滚动叙事、Tab 键盘、锚点焦点）
  static/             app-icon.png、favicon.svg（App 真实图标）
assets/               构建产物：内容哈希命名的 CSS/JS（不可变缓存）
index.html …          构建生成的站点页面（勿直接手改）
```

## 构建

```bash
python3 scripts/build.py          # 构建到仓库根目录
python3 scripts/build.py --check-only   # 只校验（不写文件）
make build                        # 等价于上面
make serve                        # 构建后本地预览 http://localhost:8080
```

构建脚本会自动：

1. 渲染 7 个页面（首页、完整功能、隐私、条款、帮助、安全、404）；
2. 以内容哈希命名 CSS/JS 并输出到 `assets/`（配合 `_headers` 的 `immutable` 缓存规则，发布滚动安全）；
3. 生成 `robots.txt`、`sitemap.xml`、`_headers`（安全响应头 + 缓存策略）、`BUILD_PROVENANCE.txt`；
4. 清理上一次构建遗留的旧产物（`.vite/`、旧哈希资产等）；
5. 自检：内部链接、页内锚点、未替换占位符。

> **修改内容请编辑 `site/` 下的源文件，不要直接改根目录生成文件。** 根目录文件每次构建都会被覆盖。

## 验证

```bash
make serve                         # 终端 1：本地预览
python3 scripts/verify-cdp.py      # 终端 2：交互/滚动叙事/主题/无障碍/布局
```

验证使用系统临时目录 `/tmp` 存放浏览器 profile，不会污染仓库。
桌面端的四段滚动故事使用稳定的粘性舞台；手机端、无 JavaScript 和
`prefers-reduced-motion: reduce` 环境会自动退化成普通内容流，不接管系统滚动。

## 内容约定

- 页面文案优先中文；英文仅作为辅助标注（如五个页面的英文名）。
- 「功能清单」使用统一状态徽章，与 App 工程 `FreshProductionCapabilities`、
  `FreshLife_Feature_Map.md` 保持一致：
  - `现在就能用`（当前版本已提供）
  - `本机离线可用`（设备本地完成，无需联网）
  - `需要联网`（仅在主动使用时需要网络）
  - `在计划里`（不在当前版本，属于路线图）
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
# 打开 http://localhost:8080
```
