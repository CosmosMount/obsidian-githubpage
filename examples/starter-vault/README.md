# 官方演示与 Starter Vault

本目录同时用于：

- 构建插件的[在线演示站](https://cosmosmount.github.io/obsidian-githubpage/)。
- 作为新站点仓库的最小模板。
- 通过 [Starter Vault ZIP](https://github.com/CosmosMount/obsidian-githubpage/releases/latest/download/obsidian-githubpage-starter-vault.zip) 下载。

复制为自己的仓库后：

1. 修改 `.githubpage/site.json` 中的标题和 `site.baseUrl`。
2. `engineVersion` 会被 Pages Workflow 用来安装精确 CLI；不需要维护 `package.json` 或 `package-lock.json`。
3. 将本目录的 `.github/workflows/pages.yml` 放在新仓库根目录。
4. 把新仓库根目录作为 Obsidian Vault 打开并启用 **GitHubPage** 插件。
5. 在 GitHub Settings → Pages 中选择 **GitHub Actions**，并用 PR 和构建检查保护 `main`。

如果先打开一个空目录作为 Vault，也可以在插件设置中点击 **Download and initialize**，或执行 **GitHubPage: Initialize Starter Vault from GitHub**。空 Vault 会安装完整示例；已有笔记的 Vault 只写入 `.githubpage/` 与 Pages Workflow。初始化只写入缺失文件，不覆盖现有内容；它不会自动创建远端 GitHub 仓库。

默认发布全部 Markdown。`draft: true` 或 `publish: false` 只会从网站构建中排除页面，不会从 Git 历史中删除内容。
