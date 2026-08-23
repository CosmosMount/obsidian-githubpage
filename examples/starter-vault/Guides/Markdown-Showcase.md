---
title: Markdown 语法演示
---

这页用于验证本地预览与线上 Pages 使用同一渲染契约。

## Wikilink 与 Callout

返回 [首页](../index.md)，或打开 [[Guides/Publishing#5-发布前验证|发布前验证]]。

> [!note] Obsidian Callout
> Callout 在 Markdown 中保持原生写法，由共享渲染核心转换为网站组件。

## GFM 表格和任务

| 语法 | v1 状态 |
| --- | --- |
| 表格 | 支持 |
| 任务列表 | 支持 |
| 脚注 | 支持 |
| 数学公式 | 支持 |
| Canvas / Bases / Dataview | 不执行 |

- [x] 已完成的任务
- [ ] 尚未完成的任务

## 代码与数学

```ts
const localAndPages = "one renderer";
```

行内公式 $a^2+b^2=c^2$，以及块公式：

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

脚注也会进入页面与搜索文本。[^contract]

[^contract]: 完全一致指同一引擎、主题、配置、浏览器和字体条件下的 DOM、CSS 与资产一致。
