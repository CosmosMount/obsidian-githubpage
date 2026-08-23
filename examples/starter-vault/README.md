# 官方演示与 Starter Vault

本目录同时用于：

- 构建插件的[在线演示站](https://cosmosmount.github.io/obsidian-githubpage/)。
- 作为新站点仓库的最小模板。

复制为自己的仓库后：

1. 修改 `.githubpage/site.json` 中的标题和 `site.baseUrl`。
2. 保持 `engineVersion` 与 `package.json` 中的精确 CLI 版本一致。
3. 将本目录的 `.github/workflows/pages.yml` 放在新仓库根目录。
4. 把新仓库根目录作为 Obsidian Vault 打开并启用 **GitHubPage** 插件。
5. 在 GitHub Settings → Pages 中选择 **GitHub Actions**，并用 PR 和构建检查保护 `main`。

默认发布全部 Markdown。`draft: true` 或 `publish: false` 只会从网站构建中排除页面，不会从 Git 历史中删除内容。
