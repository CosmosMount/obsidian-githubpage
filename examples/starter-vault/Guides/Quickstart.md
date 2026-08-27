---
title: 快速开始
---

## 安装桌面插件

从 [GitHub Release](https://github.com/CosmosMount/obsidian-githubpage/releases/latest) 下载以下三个文件：

```text
main.js
manifest.json
styles.css
```

把它们放入 Vault 的 `.obsidian/plugins/obsidian-githubpage/`，然后在 Obsidian 的社区插件设置中启用 **GitHubPage**。v1 仅支持 Windows、macOS 和 Linux 桌面端。

升级插件时仍只需替换这三个文件；替换后重启 Obsidian，或在社区插件设置中禁用再启用 GitHubPage。

## 自动下载 Starter Vault

打开一个空目录作为 Vault 后，执行 **GitHubPage: Initialize Starter Vault from GitHub**，或在插件设置中点击 **Download and initialize**。插件会从 [最新 Release 的 Starter Vault ZIP](https://github.com/CosmosMount/obsidian-githubpage/releases/latest/download/obsidian-githubpage-starter-vault.zip) 下载完整模板。已有笔记的 Vault 会自动使用精简模式，只写入 `.github/workflows/pages.yml` 和 `.githubpage/`，不会混入示例文档。

也可以直接下载 ZIP 并解压到仓库根目录。初始化不会覆盖已有文件，也不会自动创建 GitHub 远端仓库或提交 Git。

## 打开兼容仓库

```bash
git clone git@github.com:YOUR_NAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

将仓库根目录作为 Obsidian Vault 打开。仓库根目录同时必须是 Git 根目录；插件会拒绝操作嵌套在其他 Git 仓库中的 Vault。Pages Workflow 会按 `.githubpage/site.json` 自动下载匹配版本的 CLI，不需要 npm 锁文件。

## 本地预览

1. 打开任意 Markdown 页面。
2. 执行命令 **GitHubPage: Open website preview**。
3. 编辑并保存笔记。
4. 预览会防抖重建并刷新当前网站页面。

预览服务只绑定 `127.0.0.1`，使用随机会话路径、Cookie、CSP 和受限 iframe。它显示的是网站渲染结果，而不是另一套 Obsidian Reading View 样式。

预览页面的左侧文件树和右侧本页目录可以分别用 `−`/`+` 折叠。右侧目录隐藏序号，H2、H3、H4 分别处于 0、1.25rem、2.5rem 的缩进层级；长数学公式只在自己的滚动容器内横向移动。

插件升级后，如果 `site.json` 使用的是同一主版本内的旧引擎号，会自动迁移到插件版本；Pages 使用的 CLI 仍按 `engineVersion` 精确安装，构建失败时先检查两者是否一致。

下一步：[[Guides/Publishing|发布到 GitHub Pages]]。
