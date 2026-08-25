---
title: 发布到 GitHub Pages
---

这份文档描述一个兼容仓库从克隆到上线的完整流程。本站本身也使用同样的流程构建。

## 1. 准备 Vault 仓库

仓库根目录至少包含：

```text
vault/
├── .github/workflows/pages.yml
├── .githubpage/
│   ├── site.json
│   └── theme/
│       ├── theme.json
│       ├── layout.html
│       └── styles.css
├── package.json
├── package-lock.json
└── index.md
```

## 2. 固定渲染器版本

`package.json` 使用精确版本，不使用 `^` 或 `latest`：

```json
{
  "private": true,
  "scripts": {
    "validate": "obsidian-githubpage validate --root .",
    "build": "obsidian-githubpage build --root . --output _site"
  },
  "devDependencies": {
    "@obsidian-githubpage/cli": "1.0.1"
  }
}
```

`.githubpage/site.json` 中的 `engineVersion` 必须与 CLI 和本地插件完全相同：

```json
{
  "schemaVersion": 1,
  "engineVersion": "1.0.1",
  "site": {
    "title": "我的知识库",
    "baseUrl": "https://YOUR_NAME.github.io/YOUR_REPOSITORY",
    "language": "zh-CN"
  },
  "theme": { "path": ".githubpage/theme" }
}
```

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
          cache: npm
          cache-dependency-path: package-lock.json
      - run: npm ci --ignore-scripts --no-audit --no-fund
      - run: npm run validate && npm run build
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
npm ci --ignore-scripts
npm run validate
npm run build
```

`validate` 会报告配置版本漂移、危险主题、失效或歧义链接及缺失资源。构建成功后 `_site/` 应包含 `index.html`、搜索索引、sitemap、主题资产和 `.nojekyll`。

## 6. 推送与验收

推送到受保护的 `main` 后，Pages Workflow 会上传并部署静态 artifact。部署成功后至少检查：

- 首页和多级导航能够打开。
- 内部链接包含正确的仓库基础路径。
- 搜索、暗色模式和目录可用。
- `draft: true` 与 `publish: false` 页面没有进入产物。
- 页面源码中的 generator 版本与 `engineVersion` 一致。

站点仓库不需要 npm 发布 Token；公开 CLI 可以直接安装。继续阅读 [[Guides/Git-Collaboration|多人 Git 协作]]。

如果不想手动创建上述目录，可以从 [最新 Release 下载 Starter Vault ZIP](https://github.com/CosmosMount/obsidian-githubpage/releases/latest/download/obsidian-githubpage-starter-vault.zip)，或在已打开的空 Vault 中执行插件命令 **GitHubPage: Initialize Starter Vault from GitHub**。插件会检查目标文件冲突后再写入，不会覆盖已有笔记。
