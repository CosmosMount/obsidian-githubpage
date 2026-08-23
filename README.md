# Obsidian GitHubPage

Obsidian GitHubPage 是一个桌面端 Obsidian 插件：将 GitHub Pages 仓库根目录直接作为 Vault，以 Obsidian 原生方式编写，并在 Obsidian 中预览由线上部署使用的同一渲染核心、同一主题和同一精确版本生成的网站。

## 已实现能力

- 共享的纯 TypeScript 渲染核心，同时供插件预览和构建 CLI 使用。
- 仓库内 `.githubpage/site.json` 与 `.githubpage/theme/` 配置、布局、CSS 和本地资源。
- Markdown、wikilink、图片嵌入、Callout、任务列表、GFM 表格、脚注、代码块和数学公式。
- 与真实文件夹/文件名一致的左侧树形导航、漂亮 URL、面包屑、目录、搜索和暗色模式。
- 仅监听 `127.0.0.1` 的内存预览，使用随机会话 Cookie、CSP 和沙箱 iframe。
- 保存后防抖重建；内容不变的页面从构建缓存复用，结构或主题变化时自动失效。
- 系统 Git 状态、选择暂存、提交、任务分支、快进拉取、推送、同步、合并主分支、安全中止和 PR 网页跳转。
- GitHub Actions PR 校验和合并至 `main` 后的 GitHub Pages 部署。

## 使用方式

1. 安装并启用本插件一次。
2. 克隆一个兼容仓库，例如 [`examples/starter-vault`](examples/starter-vault)。
3. 修改 `.githubpage/site.json` 中的站点地址，将仓库根目录作为 Obsidian Vault 打开。
4. 执行 **GitHubPage: Open website preview**，在原生编辑器旁查看网站预览。
5. 在设置中填写作者分支名，通过命令面板创建 `author/<作者>/<任务>` 分支、提交并同步，然后打开 GitHub PR。

插件不会保存 GitHub Token。HTTPS 使用 Git Credential Manager/系统密钥环，SSH 使用现有密钥。Vault 根目录必须同时是 Git 根目录，避免插件误操作上级仓库。

## 仓库协议

```text
vault/
├── .github/workflows/pages.yml
├── .githubpage/
│   ├── site.json
│   └── theme/
│       ├── theme.json
│       ├── layout.html
│       ├── styles.css
│       └── assets/
├── Folder/
│   └── Note.md
└── index.md
```

`site.json` 的 `engineVersion` 必须与插件/CLI 精确一致。默认发布全部 Markdown；`draft: true` 或 `publish: false` 排除页面。排除只影响构建，敏感内容不得提交到 Git。

主题布局可以使用以下 Handlebars 插槽：`head`、`runtime`、`siteTitle`、`pageTitle`、`language`、`basePath`、`navigation`、`breadcrumbs`、`tableOfContents`、`search`、`darkMode` 和 `content`。主题不允许脚本、事件属性、外部资源、主动 SVG、meta refresh 或 CSS `@import`；交互来自内置运行时。

完整 JSON Schema 位于 [`schemas/site.schema.json`](schemas/site.schema.json) 和 [`schemas/theme.schema.json`](schemas/theme.schema.json)。

## CLI

```bash
obsidian-githubpage validate --root .
obsidian-githubpage build --root . --output _site
```

CLI 遇到配置、主题、歧义链接、失效 wikilink、失效 Markdown 链接、资源或数学公式错误时返回非零退出码。输出采用临时目录写完后替换，拒绝写入 Vault 根、`.git`、`.obsidian` 或 `.githubpage`。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
```

构建会在根目录生成 Obsidian 所需的 `main.js`，并生成独立的 CLI、核心和 Node 适配器产物。插件发布需包含 `main.js`、`manifest.json` 和 `styles.css`。

## v1 边界

- 仅 Windows、macOS、Linux 桌面端。
- 不兼容任意 Jekyll/Quartz 主题，不执行仓库自带 JavaScript。
- Canvas、Bases、Dataview 等动态插件语法不做网站执行。
- 同一浏览器、字体和视口下保证相同 DOM、CSS、资源与视觉结果；不同平台的字体栅格化可能不同。

## 安全

请阅读 [SECURITY.md](SECURITY.md)。GitHub Pages 网站通常是公开的，即使源仓库可见性不同，也不应把构建排除当作保密机制。
