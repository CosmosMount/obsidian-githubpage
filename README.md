# Obsidian GitHubPage

Obsidian GitHubPage 是一个桌面端 Obsidian 插件：既可以把整个 Vault 作为 GitHub Pages 仓库，也可以选择 Vault 内的一个文件夹作为独立仓库；用户以 Obsidian 原生方式编写，并在 Obsidian 中预览由线上部署使用的同一渲染核心、同一主题和同一精确版本生成的网站。

## 在线验证

- [官方演示站](https://cosmosmount.github.io/obsidian-githubpage/)：由公开 npm CLI 从示例 Vault 构建并部署。
- [发布到 GitHub Pages](https://cosmosmount.github.io/obsidian-githubpage/Guides/Publishing/)：完整仓库结构、配置、Workflow 与验收步骤。
- [插件 Release](https://github.com/CosmosMount/obsidian-githubpage/releases/latest)、[Starter Vault ZIP](https://github.com/CosmosMount/obsidian-githubpage/releases/latest/download/obsidian-githubpage-starter-vault.zip) 与 [npm CLI](https://www.npmjs.com/package/@obsidian-githubpage/cli)。

演示站源码位于 [`examples/starter-vault`](examples/starter-vault)，根目录的 Pages Workflow 每次从 npm 安装精确版本 CLI，因此线上页面本身就是发布链路的端到端验证。

## 已实现能力

- 共享的纯 TypeScript 渲染核心，同时供插件预览和构建 CLI 使用。
- 仓库内 `.githubpage/site.json` 与 `.githubpage/theme/` 配置、布局、CSS 和本地资源。
- Markdown、wikilink、图片嵌入、Callout、任务列表、GFM 表格、脚注、代码块和数学公式。
- 与真实文件夹/文件名一致的左侧树形导航、漂亮 URL、面包屑、Notion 风格目录、搜索和暗色模式。
- 左右目录栏可独立折叠；右侧目录隐藏序号，并用 H2/H3/H4 的 0、1.25rem、2.5rem 左缩进表示标题层级；长数学公式只在自身容器内横向滚动。
- 仅监听 `127.0.0.1` 的内存预览，使用随机会话 Cookie、CSP 和沙箱 iframe。
- 保存后防抖重建；内容不变的页面从构建缓存复用，结构或主题变化时自动失效。
- 点击式仓库检测、发布面板和“选择改动 → 提交 → 快进拉取 → 推送”引导流程，以及独立的状态、拉取、推送、任务分支、合并主分支、安全中止和 PR 网页跳转。
- GitHub Actions PR 校验和合并至 `main` 后的 GitHub Pages 部署。

## 使用方式

1. 从 [最新 Release](https://github.com/CosmosMount/obsidian-githubpage/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`，放入 Vault 的 `.obsidian/plugins/github-page/`，然后启用 **GitHubPage**。升级文件后重启 Obsidian，或禁用再重新启用插件。
2. 在 **设置 → GitHubPage → Repository location** 选择 **Current Vault** 或 **Folder inside current Vault**。也可以点击 **Detect repositories** 自动扫描 Vault 根及前三层文件夹中的 Git 仓库，再点击 **Apply location**。旧版本设置会继续默认使用整个 Vault。
3. 如果当前仓库还没有站点文件，可执行 **GitHubPage: Initialize Starter Vault from GitHub**。已有内容的仓库会自动使用精简模式，只写入 `.githubpage/` 和 Pages Workflow。
4. 也可以直接下载 [Starter Vault ZIP](https://github.com/CosmosMount/obsidian-githubpage/releases/latest/download/obsidian-githubpage-starter-vault.zip)，解压到所选仓库根目录。
5. 修改 `.githubpage/site.json` 中的站点地址（只需首次配置）。插件升级时会自动迁移兼容的 `engineVersion`，不需要手动改 JSON。
6. 执行 **GitHubPage: Open website preview**，在原生编辑器旁查看网站预览；保存 Markdown 后，预览会防抖重建。
7. 点击左侧功能区的云上传图标，或在设置中点击 **Open publish panel**。选择 **Review and publish** 后勾选文件、填写提交说明，插件会提交改动、在工作区干净时快进拉取远端并推送当前分支。
8. 推荐在设置中填写作者分支名，通过命令面板创建 `author/<作者>/<任务>` 分支，发布后打开 GitHub PR。若仓库策略允许，也可在设置中启用 **Allow direct main-branch push**，直接发布到主分支。

### 内容更新后如何同步远端

保存笔记、重建预览和发布远端是三个独立动作：保存只写入本地文件；自动重建只刷新 Obsidian 内预览；只有 **Publish updates / Review and publish** 才会操作 Git。主分支直推模式下，推送成功会触发 `.github/workflows/pages.yml` 并更新 GitHub Pages；协作分支模式下，需在发布面板打开 PR，并在合并到 `main` 后触发 Pages。

若发布时取消勾选了部分改动，插件只提交并推送选中的文件，同时保留其余本地改动；为避免拉取影响未提交内容，本次会安全跳过远端拉取。插件从不强推，远端已前进或出现冲突时会停止并提示处理。

### 预览中的目录和公式

左侧目录显示 Vault 中真实的文件夹和文件名，文件夹可按层级展开；点击目录栏的 `−`/`+` 可以独立收起或恢复左右侧栏。右侧“本页目录”不显示序号，H2 为顶层，H3 向右缩进 `1.25rem`，H4 向右缩进 `2.5rem`，点击链接可跳转到标题锚点。超长行内公式和块公式都在公式容器内横向滚动，不会撑宽页面。

插件不会保存 GitHub Token。HTTPS 使用 Git Credential Manager/系统密钥环，SSH 使用现有密钥。所选位置必须正好是 Git 仓库根目录；插件会拒绝把普通子目录或上级仓库误当成当前站点仓库。

初始化命令只在所选仓库缺少 `.githubpage/site.json` 时执行，并且会在写入前检查所有目标文件；已有文件不会被覆盖。空仓库安装完整示例，已有内容的仓库只安装站点支持文件。它不会替用户创建 GitHub 仓库、配置 `origin` 或提交 Git，仓库创建和权限仍由 GitHub/Git 完成。

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

Vault 内文件夹模式的结构如下，Vault 中仓库外的内容不会参与预览构建、Git 状态或发布：

```text
vault/
├── .obsidian/
├── Private Notes/
└── Published Site/          ← 设置中的 Repository folder
    ├── .git/
    ├── .github/workflows/pages.yml
    ├── .githubpage/
    └── index.md
```

`site.json` 的 `engineVersion` 必须与插件/CLI 精确一致。插件升级时会自动迁移 schema 兼容的版本；Pages Workflow 按该值临时安装 CLI，因此 Vault 不需要 `package.json` 或 `package-lock.json`。默认发布全部 Markdown；`draft: true` 或 `publish: false` 排除页面。排除只影响构建，敏感内容不得提交到 Git。

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
npm run check
```

构建会在根目录生成 Obsidian 所需的 `main.js`，并生成独立的 CLI、核心和 Node 适配器产物。插件发布需包含 `main.js`、`manifest.json` 和 `styles.css`。

## v1 边界

- 仅 Windows、macOS、Linux 桌面端。
- 不兼容任意 Jekyll/Quartz 主题，不执行仓库自带 JavaScript。
- Canvas、Bases、Dataview 等动态插件语法不做网站执行。
- 同一浏览器、字体和视口下保证相同 DOM、CSS、资源与视觉结果；不同平台的字体栅格化可能不同。

## 安全

请阅读 [SECURITY.md](SECURITY.md)。GitHub Pages 网站通常是公开的，即使源仓库可见性不同，也不应把构建排除当作保密机制。
