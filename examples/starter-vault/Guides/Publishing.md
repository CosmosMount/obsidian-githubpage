---
title: 发布到 GitHub Pages
---

这份文档描述一个兼容仓库从克隆到上线的完整流程。本站本身也使用同样的流程构建。

## 1. 准备 Vault 仓库

插件支持整个 Vault 就是仓库，也支持 Vault 内的文件夹是仓库。无论采用哪种布局，设置中选中的仓库根目录至少包含：

```text
vault/
├── .github/workflows/pages.yml
├── .githubpage/
│   ├── site.json
│   └── theme/
│       ├── theme.json
│       ├── layout.html
│       └── styles.css
└── index.md
```

不需要在 Vault 根目录创建 `package.json` 或 `package-lock.json`。插件的内置渲染器负责本地预览，Pages Workflow 会按 `site.json` 中的精确版本临时安装 CLI。

## 2. 固定渲染器版本

`.githubpage/site.json` 保存站点配置和精确引擎版本：

`.githubpage/site.json` 中的 `engineVersion` 必须与 CLI 和本地插件完全相同：

```json
{
  "schemaVersion": 1,
  "engineVersion": "1.1.1",
  "site": {
    "title": "我的知识库",
    "baseUrl": "https://YOUR_NAME.github.io/YOUR_REPOSITORY",
    "language": "zh-CN"
  },
  "theme": { "path": ".githubpage/theme" }
}
```

插件升级后会在 schema 兼容时自动把 `engineVersion` 迁移到插件版本；无需手动编辑 JSON。CLI 在 Pages 中仍按该版本严格构建，避免本地与线上漂移。

默认主题的右侧“本页目录”采用无序号的紧凑链接样式；H2、H3、H4 链接块分别保持 0、1.25rem、2.5rem 左缩进，字号不变。左侧文件树靠近页面边缘，这些布局样式和 Markdown 内容一起从 Vault 发布。

项目 Pages 的 `baseUrl` 必须包含仓库子路径。用户主页仓库 `YOUR_NAME.github.io` 才部署在域名根路径。

## 3. 添加 Pages Workflow

创建 `.github/workflows/pages.yml`：

```yaml
name: Build and deploy GitHubPage

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: read
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - name: Read the pinned renderer version
        id: renderer
        run: |
          VERSION=$(node -e "const fs=require('fs');console.log(JSON.parse(fs.readFileSync('.githubpage/site.json','utf8')).engineVersion)")
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
      - name: Validate and build
        env:
          ENGINE_VERSION: ${{ steps.renderer.outputs.version }}
        run: |
          CLI_DIR="${RUNNER_TEMP}/githubpage-cli"
          mkdir -p "${CLI_DIR}"
          npm install --prefix "${CLI_DIR}" --no-save --package-lock=false --ignore-scripts --no-audit --no-fund "@obsidian-githubpage/cli@${ENGINE_VERSION}"
          node "${CLI_DIR}/node_modules/@obsidian-githubpage/cli/dist/index.cjs" validate --root .
          node "${CLI_DIR}/node_modules/@obsidian-githubpage/cli/dist/index.cjs" build --root . --output _site
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## 4. 启用 Pages

在 GitHub 仓库进入 **Settings → Pages → Build and deployment**，将 Source 设为 **GitHub Actions**。这是每个站点仓库只需执行一次的管理员操作。

## 5. 发布前验证

```bash
ENGINE_VERSION=$(node -e "const fs=require('fs');console.log(JSON.parse(fs.readFileSync('.githubpage/site.json','utf8')).engineVersion)")
npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund "@obsidian-githubpage/cli@${ENGINE_VERSION}"
node node_modules/@obsidian-githubpage/cli/dist/index.cjs validate --root .
node node_modules/@obsidian-githubpage/cli/dist/index.cjs build --root . --output _site
```

`validate` 会报告配置版本漂移、危险主题、失效或歧义链接及缺失资源。构建成功后 `_site/` 应包含 `index.html`、搜索索引、sitemap、主题资产和 `.nojekyll`。

## 6. 推送与验收

内容更新后，点击插件左侧功能区的云上传图标，或打开 **设置 → GitHubPage → Open publish panel**。选择 **Review and publish**，确认文件和提交说明；插件会提交、快进同步并推送。也可以在同一面板中分别执行状态检查、Pull、Push、打开 PR 和预览重建。

推送到 `main` 后，Pages Workflow 会上传并部署静态 artifact；协作分支需先合并 PR 到 `main`。部署成功后至少检查：

- 首页和多级导航能够打开。
- 内部链接包含正确的仓库基础路径。
- 搜索、暗色模式和目录可用。
- `draft: true` 与 `publish: false` 页面没有进入产物。
- 页面源码中的 generator 版本与 `engineVersion` 一致。

站点仓库不需要 npm 发布 Token；公开 CLI 可以直接安装。继续阅读 [[Guides/Git-Collaboration|多人 Git 协作]]。

如果不想手动创建上述目录，可以从 [最新 Release 下载 Starter Vault ZIP](https://github.com/CosmosMount/obsidian-githubpage/releases/latest/download/obsidian-githubpage-starter-vault.zip)，或执行插件命令 **GitHubPage: Initialize Starter Vault from GitHub**。空 Vault 会安装完整示例；已有笔记的 Vault 只写入 `.githubpage/` 和 Pages Workflow，不会把示例笔记、npm 配置混入你的文档，也不会覆盖已有文件。
