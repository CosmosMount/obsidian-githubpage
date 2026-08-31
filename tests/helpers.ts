import type { LoadedTheme, ProjectInput, SiteConfig, SourceFile } from "@obsidian-githubpage/core";

export const config: SiteConfig = {
  schemaVersion: 1,
  engineVersion: "1.1.1",
  site: { title: "Test Vault", baseUrl: "https://example.github.io/notes", language: "en" },
  content: {
    root: ".",
    exclude: ["README.md"],
    assetExtensions: [".png", ".svg", ".pdf"],
  },
  theme: { path: ".githubpage/theme" },
};

export const theme: LoadedTheme = {
  manifest: {
    schemaVersion: 1,
    id: "test-theme",
    name: "Test theme",
    version: "1.0.0",
    layout: { template: "layout.html" },
    components: { navigation: true, breadcrumbs: true, tableOfContents: true, search: true, darkMode: true },
    tokens: { accent: "#6750ff" },
  },
  template:
    '<html lang="{{language}}" data-base-path="{{basePath}}"><head>{{{head}}}</head><body>{{{search}}}{{{darkMode}}}{{{navigation}}}{{{breadcrumbs}}}{{{tableOfContents}}}{{{content}}}{{{runtime}}}</body></html>',
  css: ":root { color: #222; }",
  assets: [],
};

export function textFile(filePath: string, content: string): SourceFile {
  return { path: filePath, content, mediaType: "text/markdown; charset=utf-8" };
}

export function project(files: SourceFile[]): ProjectInput {
  return { config, theme, files };
}
