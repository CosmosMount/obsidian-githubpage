import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { markdownToPlainText, renderMarkdown, renderTableOfContents } from "./markdown";
import { renderBreadcrumbs, renderNavigation } from "./navigation";
import {
  basePathFromUrl,
  encodeUrlPath,
  escapeHtml,
  isSafeRelativePath,
  normalizeProjectPath,
  routeToOutputPath,
  sourcePathToRoute,
  stableFingerprint,
  withBasePath,
} from "./paths";
import { BUILTIN_RUNTIME } from "./runtime";
import { renderTheme, renderThemeTokens, validateTheme } from "./theme";
import type {
  BuildCache,
  BuildDiagnostic,
  BuildResult,
  OutputFile,
  PageRecord,
  ProjectInput,
  SourceFile,
} from "./types";

export function buildSite(input: ProjectInput, previous?: BuildCache): BuildResult {
  validateTheme(input.theme);
  const diagnostics: BuildDiagnostic[] = [];
  const outputs = new Map<string, OutputFile>();
  const basePath = basePathFromUrl(input.config.site.baseUrl);
  const pages = collectPages(input.files, diagnostics);
  const globalFingerprint = stableFingerprint(
    JSON.stringify({
      config: input.config,
      manifest: input.theme.manifest,
      template: input.theme.template,
      css: input.theme.css,
      paths: input.files.map((file) => file.path).sort(),
      themeAssets: input.theme.assets.map((file) => file.path).sort(),
    }),
  );
  const cache: BuildCache = { globalFingerprint, pages: {} };
  const renderedPages: string[] = [];
  const reusedPages: string[] = [];

  for (const page of pages) {
    const sourceFingerprint = stableFingerprint(JSON.stringify({ body: page.body, data: page.data, title: page.title }));
    const cached = previous?.globalFingerprint === globalFingerprint ? previous.pages[page.sourcePath] : undefined;
    if (cached?.sourceFingerprint === sourceFingerprint) {
      outputs.set(cached.output.path, cached.output);
      diagnostics.push(...cached.diagnostics);
      cache.pages[page.sourcePath] = cached;
      reusedPages.push(page.sourcePath);
      continue;
    }
    const rendered = renderPage(input, page, pages, basePath);
    outputs.set(rendered.output.path, rendered.output);
    diagnostics.push(...rendered.diagnostics);
    cache.pages[page.sourcePath] = {
      sourceFingerprint,
      output: rendered.output,
      diagnostics: rendered.diagnostics,
    };
    renderedPages.push(page.sourcePath);
  }

  addStaticOutputs(input, pages, basePath, outputs, diagnostics);
  return { outputs, diagnostics, cache, renderedPages, reusedPages };
}

function collectPages(files: SourceFile[], diagnostics: BuildDiagnostic[]): PageRecord[] {
  const pages: PageRecord[] = [];
  const routeOwners = new Map<string, string>();
  for (const file of files) {
    if (!file.path.toLocaleLowerCase("en").endsWith(".md") || typeof file.content !== "string") continue;
    const sourcePath = normalizeProjectPath(file.path);
    if (!isSafeRelativePath(sourcePath)) {
      diagnostics.push({ severity: "error", code: "UNSAFE_SOURCE_PATH", message: `Unsafe source path: ${file.path}` });
      continue;
    }
    const parsed = parseFrontmatter(file.content);
    if (parsed.data.draft === true || parsed.data.publish === false) continue;
    const route = sourcePathToRoute(sourcePath);
    const existing = routeOwners.get(route);
    if (existing) {
      diagnostics.push({
        severity: "error",
        code: "DUPLICATE_ROUTE",
        message: `Both ${existing} and ${sourcePath} map to ${route}`,
        path: sourcePath,
      });
      continue;
    }
    routeOwners.set(route, sourcePath);
    const fallbackTitle = path.posix.basename(sourcePath, path.posix.extname(sourcePath));
    pages.push({
      sourcePath,
      route,
      outputPath: routeToOutputPath(route),
      title: typeof parsed.data.title === "string" && parsed.data.title.trim() ? parsed.data.title.trim() : fallbackTitle,
      body: parsed.content,
      data: parsed.data,
      plainText: markdownToPlainText(parsed.content),
    });
  }
  return pages.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en", { numeric: true }));
}

function renderPage(
  input: ProjectInput,
  page: PageRecord,
  pages: PageRecord[],
  basePath: string,
): { output: OutputFile; diagnostics: BuildDiagnostic[] } {
  const rendered = renderMarkdown(page, pages, input.files, basePath);
  page.plainText = rendered.plainText;
  const components = input.theme.manifest.components;
  const canonical = `${input.config.site.baseUrl.replace(/\/+$/, "")}${page.route === "/" ? "/" : page.route}`;
  const stylesheet = encodeUrlPath(withBasePath(basePath, "/_githubpage/theme.css"));
  const tokens = encodeUrlPath(withBasePath(basePath, "/_githubpage/tokens.css"));
  const runtimePath = encodeUrlPath(withBasePath(basePath, "/_githubpage/runtime.js"));
  const csp = "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'";
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<meta name="generator" content="Obsidian GitHubPage ${escapeHtml(input.config.engineVersion)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<link rel="stylesheet" href="${stylesheet}">`,
    `<link rel="stylesheet" href="${tokens}">`,
    `<title>${escapeHtml(page.title)} · ${escapeHtml(input.config.site.title)}</title>`,
  ].join("\n");
  const search = components.search
    ? '<div class="site-search"><label><span class="sr-only">Search</span><input type="search" data-site-search placeholder="Search"></label><div class="search-results" data-search-results hidden></div></div>'
    : "";
  const darkMode = components.darkMode
    ? '<button type="button" class="theme-toggle" data-theme-toggle aria-label="Toggle color theme">◐</button>'
    : "";
  const content = `<article class="page-content"><h1>${escapeHtml(page.title)}</h1>${rendered.html}</article>`;
  const html = renderTheme(input.theme, {
    head,
    runtime: `<script defer src="${runtimePath}"></script>`,
    language: input.config.site.language,
    basePath,
    siteTitle: input.config.site.title,
    pageTitle: page.title,
    navigation: components.navigation ? renderNavigation(pages, basePath, page.route) : "",
    breadcrumbs: components.breadcrumbs ? renderBreadcrumbs(page, basePath) : "",
    tableOfContents: components.tableOfContents ? renderTableOfContents(rendered.headings) : "",
    search,
    darkMode,
    content,
  });
  return {
    output: { path: page.outputPath, content: html, mediaType: "text/html; charset=utf-8" },
    diagnostics: rendered.diagnostics,
  };
}

function addStaticOutputs(
  input: ProjectInput,
  pages: PageRecord[],
  basePath: string,
  outputs: Map<string, OutputFile>,
  diagnostics: BuildDiagnostic[],
): void {
  outputs.set("_githubpage/runtime.js", {
    path: "_githubpage/runtime.js",
    content: BUILTIN_RUNTIME,
    mediaType: "text/javascript; charset=utf-8",
  });
  outputs.set("_githubpage/theme.css", {
    path: "_githubpage/theme.css",
    content: input.theme.css,
    mediaType: "text/css; charset=utf-8",
  });
  outputs.set("_githubpage/tokens.css", {
    path: "_githubpage/tokens.css",
    content: renderThemeTokens(input.theme.manifest.tokens),
    mediaType: "text/css; charset=utf-8",
  });
  for (const asset of input.theme.assets) {
    const normalized = normalizeProjectPath(asset.path);
    if (!isSafeRelativePath(normalized)) {
      diagnostics.push({ severity: "error", code: "UNSAFE_THEME_ASSET", message: `Unsafe theme asset: ${asset.path}` });
      continue;
    }
    const outputPath = `_githubpage/${normalized}`;
    outputs.set(outputPath, { path: outputPath, content: asset.content, mediaType: asset.mediaType ?? mediaTypeForPath(outputPath) });
  }
  for (const asset of input.files) {
    if (asset.path.toLocaleLowerCase("en").endsWith(".md")) continue;
    const normalized = normalizeProjectPath(asset.path);
    if (!isSafeRelativePath(normalized)) {
      diagnostics.push({ severity: "error", code: "UNSAFE_ASSET", message: `Unsafe asset path: ${asset.path}` });
      continue;
    }
    outputs.set(normalized, { path: normalized, content: asset.content, mediaType: asset.mediaType ?? mediaTypeForPath(normalized) });
  }
  outputs.set("search-index.json", {
    path: "search-index.json",
    content: JSON.stringify(
      pages.map((page) => ({
        title: page.title,
        route: encodeUrlPath(page.route),
        text: page.plainText,
      })),
    ),
    mediaType: "application/json; charset=utf-8",
  });
  outputs.set("sitemap.xml", {
    path: "sitemap.xml",
    content: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages
      .map((page) => `<url><loc>${escapeXml(`${input.config.site.baseUrl.replace(/\/+$/, "")}${page.route}`)}</loc></url>`)
      .join("")}</urlset>\n`,
    mediaType: "application/xml; charset=utf-8",
  });
  outputs.set(".nojekyll", { path: ".nojekyll", content: "", mediaType: "text/plain; charset=utf-8" });
}

function mediaTypeForPath(filePath: string): string {
  const extension = path.posix.extname(filePath).toLocaleLowerCase("en");
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".mp3": "audio/mpeg",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    }[extension] ?? "application/octet-stream"
  );
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
