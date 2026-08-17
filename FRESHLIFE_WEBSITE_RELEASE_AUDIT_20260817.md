# FreshLife 官网生产发布精修审计 · 2026-08-17

## 修改前状态

- 仓库：`~/Documents/GitHub/freshlife-website`
- 初始 commit：`8a4e25f` 「Initial FreshLife website deployment」
- 初始 branch：`main`
- remote：`https://github.com/Ming-0119/freshlife-website.git`
- 站点形态：vinext 构建产物直接提交的静态站点（无 package.json / 无源码目录 / 无 GitHub Actions）。
  内容同时以「SSR HTML + RSC hydration chunk」两份存在，部分交互组件（AppShowcase）另有客户端 JS bundle。
- 线上站点 `https://www.freshlifeapp.cn/` 由阿里云 ESA + OSS 提供，响应头含 `Server: ESA` 与 `x-oss-*`，
  内容与仓库文件逐字节一致（首页 Content-Length 与仓库 index.html 相同）。仓库内 `部署说明.txt` 提到 EdgeOne 与 `freshlifeapp.cn`，
  已属于过期说明，不代表当前真实部署。

## 发现的问题

### P0（线上可直接看到的错误）

1. `robots.txt` / `sitemap.xml` 使用 `https://freshlifeapp.cn`（无 www）。
   实测 apex `freshlifeapp.cn` 返回 403（Cloudflare），`www` 才 200。属于真实错误。
2. 所有页面 `<link rel="icon">` / `<link rel="apple-touch-icon">` 使用绝对地址 `https://freshlifeapp.cn/...`，
   指向 403 的 apex，浏览器 Tab 图标实际加载失败。
3. 首页正文暴露内部工程语言 `ItemStore`（“都通过唯一 ItemStore 更新”）。
4. 首页多处暴露 `iOS 工程`（“依据当前 FreshLife iOS 工程整理”）。
5. Privacy 页面出现草稿痕迹：“正式发布前，仍需……完成最后一次更新”“正式发布前待补充”“最终 AI 服务商名称……必须在上线前据实写明”。
6. Terms 页面出现内部备注：“StoreKit 商品完成配置后，必须把本节替换为与 App Store Connect 完全一致的正式条款”。
7. `404.html` 仅 9 字节 “Not Found”，无品牌、无返回链接。

### P1（SEO / 元数据）

8. 4 个子页面共用首页 title / description（全部是“FreshLife — 让每一份食物，都有更好的下一步”）。
9. 全部页面 canonical / og:url 为 `https://freshlifeapp.cn/`（无 www、子页面路径错误）。
10. 缺少 `og:image`。
11. 全站缺失 `:focus-visible` 键盘焦点样式（可访问性）。

### P2（内容表达）

12. 首页 “PRODUCT TRUTH” 声称“官网不会用演示数据”，与 App 展示区示例数字（Ming / 12 库存 / 减少浪费 18% 等）存在措辞矛盾。
13. Support / Safety 页面存在少量内部语气（“正式商用前应建立投诉处理流程”“正式在中国大陆向公众开放生成式 AI 前……”）。
14. Footer 以 “Ming（个人开发者）” 作为唯一运营主体展示，未确认正式法律姓名格式。

## 已修改

- `index.html`：ItemStore → 消费者语言；两处 “iOS 工程” → “正式版本”；展示区增加 “界面示例 · 示例数据” 标注；
  “演示数据”表述改为“界面示例用于展示产品体验，数字为示例数据”；canonical/og:url → `https://www.freshlifeapp.cn/`；favicon 相对化；新增 og:image。
- `assets/AppShowcase-q6iY7400.js`：同步修改客户端组件内的 “iOS 工程” 文案，保证 hydration 一致。
- `privacy/index.html`：清除 3 处草稿/内部文案，改为保守真实表述；页面专属 title/description/canonical/og。
- `terms/index.html`：清除 “StoreKit 商品完成配置后必须替换” 等内部备注；修正责任边界冗余句；页面专属元数据。
- `support/index.html`：清除 “正式商用前” 内部表述（保留“不承诺固定回复时限”的真实说明）；页面专属元数据。
- `safety/index.html`：生成式 AI 合规表述改为消费者可理解措辞；页面专属元数据。
- `robots.txt`：`Host` 与 `Sitemap` 改为 `https://www.freshlifeapp.cn`。
- `sitemap.xml`：全部 URL 改为 `https://www.freshlifeapp.cn/.../`（含尾斜杠），lastmod 更新为 2026-08-17。
- `404.html`：重建为带品牌、返回首页与帮助中心链接的完整页面。
- `assets/a11y.css`（新增）：`:focus-visible` 键盘焦点样式；并已在 5 个页面 head 引入。
- `.gitignore`（新增）：排除 `.DS_Store` 等 macOS 产物。

## 未修改及原因

- Hero、首页信息架构、视觉语言：已符合“5 秒讲清 FreshLife + 非 PRD 结构”，不做无谓重写。
- `assets/*.js` / `*.css` 内的 `localhost`、`placeholder` 等：均为框架内部逻辑（URL 回退、`::placeholder`、图片占位），非用户可见，不动。
- `window.svg` / `globe.svg` / `file.svg`：未被任何 HTML/JS/CSS 引用，属框架默认残留，未删除（避免破坏潜在懒加载，风险大于收益）。
- `最后更新：2026年8月12日` 日期：未改动（避免引入不一致，属可选维护项）。
- 动画 `scanMove` / `screenFade`：本身克制，且 CSS 已有 `prefers-reduced-motion` 完整规则，未改动。
- DNS / SSL / `www` CNAME / `_acme-challenge.www` / 根域名 A 记录：一律未触碰。

## 验证命令

```text
git diff --check                                 # PASS
grep -rnoE 'ItemStore|OWNER REQUIRED|TODO|FIXME|待补充|正式发布前|正式商用前|工程结构|iOS 工程|StoreKit|演示数据'  (html/js)   # 无残留
python3 -m http.server 8099 + curl 全路由         # 全部 200
git grep -nEi 'api_key|secret|password|token|BEGIN PRIVATE|sk-'   # 仅命中 minified CSS/JS 的误报，无真实密钥
find . -name '*.pem' -o -name '*.key' -o -name '.env' 等          # 无敏感文件
外部链接审计（href/src）                          # 无 localhost / http:// / example.com / href="#"
锚点 id 完整性检查                                 # 全部解析，无死锚点
重复 id 检查                                      # 无重复
```

## PASS / FAIL

- PASS：内容清理（ItemStore / iOS 工程 / 演示数据 / 草稿痕迹全部清除）
- PASS：SEO 元数据（title / description / canonical / og:url / og:image 按页补齐）
- PASS：robots.txt、sitemap.xml 指向 www 与尾斜杠路由
- PASS：favicon / apple-touch-icon 相对化（修复 apex 403 导致的图标加载失败）
- PASS：404.html 重建为品牌页
- PASS：`:focus-visible` 焦点样式补齐
- PASS：`git diff --check`、安全扫描、外部链接审计、锚点/重复 id 检查
- FAIL：无（无阻断项）
- NOT RUN：真实浏览器 Responsive 逐尺寸视觉验证、Lighthouse 性能审计、自动化 a11y 工具扫描（本机无浏览器自动化/工具，未伪造 PASS）

## 当前 Git commit

`aa9c6f6` Polish FreshLife website for production release

## Push 状态

`git push -u origin website-polish-20260817` 未完成：本机无可用 GitHub 凭据（credential.helper=osxkeychain 但 keychain 无 github.com 记录，且无 gh CLI / SSH key）。需 Owner 在已登录 GitHub 的终端执行推送，或将分支合并到 `main` 后按现有方式发布。

## 当前 Git branch

`website-polish-20260817`

## GitHub remote

`https://github.com/Ming-0119/freshlife-website.git`

## 部署方式

真实架构（已用 ESA CLI 实测确认，非 OSS）：

```text
GitHub: Ming-0119/freshlife-website
  ↓  esa-cli deploy（静态 Pages 项目）
阿里云 ESA Functions & Pages 项目 "freshlife-website"
  ↓  域名绑定
www.freshlifeapp.cn
```

- ESA 站点：`freshlifeapp.cn`
- Functions & Pages 项目：`freshlife-website`
- 域名绑定：`www.freshlifeapp.cn` → 该项目
- 部署方式：`esa-cli` 上传静态文件 → 生成版本 → 部署到 production
- 无 GitHub 集成（0 webhooks / 0 Actions / 0 App 安装），发布为手动 `esa-cli deploy`
- 本分支内容已通过 `esa-cli` 部署到 production（版本 `1786965065536258163`）

## 当前正式域名

```text
https://www.freshlifeapp.cn/
```

## Owner Action（需人工完成）

1. 在 ESA 控制台为该站点/项目配置「自定义 404 页」指向 `404.html`（当前缺失路径返回 ESA 默认 404 页体；`/404` 已能访问到品牌 404 页）。
2. 确认正式个人开发者法律姓名展示格式（当前为 “Ming（个人开发者）”），并在 Footer / Privacy / Terms 中统一。
3. 确认 `部署说明.txt` 是否仍需要保留（其描述为 EdgeOne + 无 www，已与当前阿里云 ESA + www 不符）。
