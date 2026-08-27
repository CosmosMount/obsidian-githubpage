---
title: Obsidian GitHubPage 在线演示
---

这个网站不是手工编写的 HTML。它来自一个普通 Obsidian Vault，由 npm 上公开的 `@obsidian-githubpage/cli@1.0.16` 在 GitHub Actions 中校验、构建并部署。

> [!tip] 阅读体验
> 左侧文件树和右侧本页目录都可以独立折叠；右侧目录采用无序号的 Notion 风格链接；长数学公式会在自己的容器内横向滚动，不会撑破正文布局。

> [!success] 端到端验证站
> 如果你正在阅读此页面，说明精确版本 CLI 安装、仓库主题加载、Obsidian Markdown 渲染、文件树导航、Pages artifact 和部署流程已经全部成功。

> [!info] 验证边界
> 这个静态站验证共享渲染核心、主题、导航和 Pages 发布链路；插件内预览与 Git 协作操作需要把 Starter Vault 复制为独立仓库后，在 Obsidian 桌面端验证。

## 从这里开始

- [[Guides/Quickstart|快速开始]]：安装插件并打开兼容 Vault。
- [[Guides/Publishing|发布指南]]：从仓库配置到 GitHub Pages 上线。
- [[Guides/Git-Collaboration|Git 协作]]：多人分支、提交、同步与 PR。
- [[Guides/Markdown-Showcase|语法演示]]：检查 Callout、表格、任务、脚注和数学公式。

## 当前验收状态

| 验收项 | 本站使用的实现 |
| --- | --- |
| 编辑源 | 原生 Markdown 文件 |
| 页面结构 | 真实文件夹与文件名 |
| 渲染器 | `@obsidian-githubpage/cli@1.0.16` |
| 主题 | Vault 内 `.githubpage/theme/` |
| 部署 | GitHub Pages 自定义 Actions |

- [x] 首页与多级导航
- [x] 内部 wikilink
- [x] 搜索、暗色模式和目录
- [x] 草稿排除
- [x] 同一配置在本地与线上构建

主题、配置和内容都和 Vault 一起进入 Git。发布排除并不等于保密，敏感信息永远不应提交到公开仓库。[^public]

$$
e^{i\pi} + 1 = 0
$$

[^public]: `draft: true` 只阻止页面进入网站产物，不会清除 Git 历史。
