---
title: Git 协作
---

插件调用系统 Git，不保存 GitHub Token。HTTPS 凭据由 Git Credential Manager 或系统密钥环管理，SSH 使用现有密钥。

## 推荐分支流程

```text
origin/main
  └── author/<用户>/<任务>
        ├── 内容提交 1
        └── 内容提交 2
              └── Pull Request → main
```

1. 先确保工作区状态明确。
2. 从最新 `origin/main` 创建 `author/<用户>/<任务>`。
3. 只暂存与本次任务有关的文件。
4. 提交并推送任务分支。
5. 使用插件生成的 compare URL 在 GitHub 创建 PR。
6. PR 构建通过并审核后再合并到受保护的 `main`。

> [!warning] 冲突策略
> 插件不会自动覆盖、自动强推或静默 stash。遇到分叉或冲突会立即停止，让用户检查文件并明确决定继续或中止。

每位协作者应在仓库级 Git 配置自己的 `user.name` 和 `user.email`。同步后统一触发一次内容重建，避免连续 Git 文件事件造成重复刷新。

返回 [[Guides/index|指南总览]]。
