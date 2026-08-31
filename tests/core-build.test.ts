import { describe, expect, it } from "vitest";
import { transformSync } from "esbuild";
import {
  buildSite,
  parseSiteConfig,
  parseThemeManifest,
  sourcePathToRoute,
  validateTheme,
} from "@obsidian-githubpage/core";
import { config, project, textFile, theme } from "./helpers";

describe("configuration contracts", () => {
  it("loads versioned site and theme manifests", () => {
    expect(parseSiteConfig(JSON.stringify(config))).toEqual(config);
    expect(parseThemeManifest(JSON.stringify(theme.manifest))).toEqual(theme.manifest);
  });

  it("refuses renderer drift", () => {
    expect(() => parseSiteConfig(JSON.stringify({ ...config, engineVersion: "2.0.0" }))).toThrow(
      expect.objectContaining({ code: "ENGINE_VERSION_MISMATCH" }),
    );
  });

  it("rejects executable theme content", () => {
    expect(() => validateTheme({ ...theme, template: `${theme.template}<script src="evil.js"></script>` })).toThrow(
      expect.objectContaining({ code: "UNSAFE_THEME_TEMPLATE" }),
    );
    expect(() => validateTheme({ ...theme, css: '@import "https://evil.invalid/style.css";' })).toThrow(
      expect.objectContaining({ code: "UNSAFE_THEME_CSS" }),
    );
    expect(() =>
      validateTheme({
        ...theme,
        assets: [{ path: "assets/active.svg", content: '<svg onload="alert(1)"></svg>' }],
      }),
    ).toThrow(expect.objectContaining({ code: "UNSAFE_THEME_SVG" }));
  });

  it("rejects a content root that escapes the Vault", () => {
    expect(() => parseSiteConfig(JSON.stringify({ ...config, content: { ...config.content, root: "../private" } }))).toThrow(
      expect.objectContaining({ code: "INVALID_SITE_CONFIG" }),
    );
  });
});

describe("site rendering", () => {
  it("renders Obsidian syntax, navigation and stable paths", () => {
    const result = buildSite(
      project([
        textFile(
          "index.md",
          `---\ntitle: Home\n---\n# Welcome\n\n[[Guides/Start|Start here]]\n\n> [!tip] Useful\n> Keep writing.\n\n- [x] shipped\n\n$$x^2$$\n\nFootnote[^1].\n\n[^1]: note`,
        ),
        textFile("Guides/Start.md", "# Start\n\nReturn to [[index]]."),
        textFile("Hidden.md", "---\ndraft: true\n---\nsecret"),
      ]),
    );
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect([...result.outputs.keys()]).toContain("Guides/Start/index.html");
    expect([...result.outputs.keys()]).not.toContain("Hidden/index.html");
    const html = String(result.outputs.get("index.html")?.content);
    expect(html).toContain('href="/notes/Guides/Start/"');
    expect(html).toContain("callout-tip");
    expect(html).toContain('type="checkbox" disabled checked');
    expect(html).toContain("<math");
    expect(html).toContain('class="math-scroll math-display"');
    expect(html).toContain("footnote-ref");
    const runtime = String(result.outputs.get("_githubpage/runtime.js")?.content);
    expect(() => transformSync(runtime, { loader: "js" })).not.toThrow();
    expect(runtime).toContain("event.stopPropagation()");
    expect(runtime).toContain('panel.classList.contains("is-collapsed")');
    expect(runtime).toContain("layout.setAttribute(layoutAttribute, String(collapsed))");
    expect(html).toContain("Content-Security-Policy");
    expect(html).not.toContain("Hidden");
    const searchIndex = JSON.parse(String(result.outputs.get("search-index.json")?.content)) as Array<{ route: string }>;
    expect(searchIndex[0]?.route).toBe("/Guides/Start/");
  });

  it("accepts Obsidian display math immediately after prose", () => {
    const result = buildSite(
      project([textFile("index.md", "代入 $f$\n$$\n\\begin{aligned}\nA &= B \\\\\n\\end{aligned}\n$$\n#### Next")]),
    );
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(String(result.outputs.get("index.html")?.content)).toContain('display="block"');
  });

  it("accepts Obsidian tables with blank lines and non-breaking-space padding", () => {
    const result = buildSite(
      project([
        textFile(
          "index.md",
          [
            "| 物理意义\u00a0 | 数学符号\u00a0 |",
            "",
            "| --- | --- |",
            "",
            "| 轮主动力矩\u00a0 | $\\tau_{w,l},\\tau_{w,r}$\u00a0 |",
            "",
            "| 轮质量\u00a0 | $m_w$\u00a0 |",
            "",
            "我们的分析过程遵循自下而上的顺序。",
            "",
            "```md",
            "| 代码表头 | 示例 |",
            "",
            "| --- | --- |",
            "```",
          ].join("\n"),
        ),
      ]),
    );
    const html = String(result.outputs.get("index.html")?.content);
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(html).toContain("<table>");
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html).toContain("<math");
    expect(html).toContain("<p>我们的分析过程遵循自下而上的顺序。</p>");
    expect(html).toContain("| 代码表头 | 示例 |");
    expect(html).not.toContain("\u00a0");
  });

  it("reports broken and ambiguous links", () => {
    const result = buildSite(
      project([
        textFile("index.md", "[[Missing]] [[Same]]"),
        textFile("a/Same.md", "a"),
        textFile("b/Same.md", "b"),
      ]),
    );
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["BROKEN_WIKILINK", "AMBIGUOUS_WIKILINK"]),
    );
  });

  it("resolves normal Markdown page and asset links", () => {
    const result = buildSite(
      project([
        textFile("index.md", "[Guide](Guide.md) [PDF](assets/file.pdf)"),
        textFile("Guide.md", "guide"),
        { path: "assets/file.pdf", content: new Uint8Array([1, 2, 3]), mediaType: "application/pdf" },
      ]),
    );
    const html = String(result.outputs.get("index.html")?.content);
    expect(html).toContain('href="/notes/Guide/"');
    expect(html).toContain('href="/notes/assets/file.pdf"');
    expect(result.diagnostics).toEqual([]);
  });

  it("reuses unchanged pages while rebuilding an edited page", () => {
    const first = buildSite(project([textFile("index.md", "one"), textFile("Second.md", "two")]));
    const second = buildSite(project([textFile("index.md", "changed"), textFile("Second.md", "two")]), first.cache);
    expect(second.renderedPages).toEqual(["index.md"]);
    expect(second.reusedPages).toEqual(["Second.md"]);
    const index = JSON.parse(String(second.outputs.get("search-index.json")?.content)) as Array<{ text: string }>;
    expect(index.some((item) => item.text === "two")).toBe(true);
  });

  it("maps index and note paths to pretty routes", () => {
    expect(sourcePathToRoute("index.md")).toBe("/");
    expect(sourcePathToRoute("Guides/index.md")).toBe("/Guides/");
    expect(sourcePathToRoute("Guides/Start.md")).toBe("/Guides/Start/");
  });
});
