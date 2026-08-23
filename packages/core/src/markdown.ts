import path from "node:path";
import MarkdownIt, {
  type MarkdownIt as MarkdownItInstance,
  type StateBlock,
  type StateCore,
  type StateInline,
  type Token,
} from "markdown-it";
import footnote from "markdown-it-footnote";
import katex from "katex";
import {
  encodeUrlPath,
  escapeHtml,
  normalizeProjectPath,
  slugifyHeading,
  stripMarkdownExtension,
  withBasePath,
} from "./paths";
import type { BuildDiagnostic, HeadingRecord, PageRecord, SourceFile } from "./types";

interface ResolveResult<T> {
  value?: T;
  status: "ok" | "missing" | "ambiguous";
}

export interface RenderedMarkdown {
  html: string;
  headings: HeadingRecord[];
  plainText: string;
  diagnostics: BuildDiagnostic[];
}

export function renderMarkdown(
  page: PageRecord,
  pages: PageRecord[],
  files: SourceFile[],
  basePath: string,
): RenderedMarkdown {
  const diagnostics: BuildDiagnostic[] = [];
  const headings: HeadingRecord[] = [];
  const headingCounts = new Map<string, number>();
  const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false });
  markdown.use(footnote);
  installMath(markdown, diagnostics, page.sourcePath);
  installWikilinks(markdown, page, pages, files, basePath, diagnostics);
  installCalloutsAndTasks(markdown);

  const originalLinkOpen = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    const href = String(token?.attrGet("href") ?? "");
    if (token && isExternalUrl(href)) {
      token.attrSet("rel", "noopener noreferrer");
    } else if (token && href && !href.startsWith("#")) {
      const [target = "", anchor] = href.split("#", 2);
      if (looksLikeAsset(target)) {
        const asset = resolveAsset(target, page.sourcePath, files);
        if (asset.status === "ok" && asset.value) {
          const suffix = anchor ? `#${encodeURIComponent(anchor)}` : "";
          token.attrSet("href", `${encodeUrlPath(withBasePath(basePath, `/${asset.value.path}`))}${suffix}`);
        } else {
          diagnostics.push(linkDiagnostic("ASSET", failedStatus(asset.status), target, page.sourcePath));
        }
      } else {
        const resolved = target ? resolvePage(target, page.sourcePath, pages) : { status: "ok" as const, value: page };
        if (resolved.status === "ok" && resolved.value) {
          const suffix = anchor ? `#${slugifyHeading(anchor)}` : "";
          token.attrSet("href", `${encodeUrlPath(withBasePath(basePath, resolved.value.route))}${suffix}`);
        } else if (/\.md(?:$|#)/i.test(href)) {
          diagnostics.push(linkDiagnostic("MARKDOWN_LINK", failedStatus(resolved.status), target, page.sourcePath));
        }
      }
    }
    return originalLinkOpen
      ? originalLinkOpen(tokens, index, options, environment, renderer)
      : renderer.renderToken(tokens, index, options);
  };

  const originalImage = markdown.renderer.rules.image;
  markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    const source = String(token?.attrGet("src") ?? "");
    if (token && source && !isExternalUrl(source) && !source.startsWith("data:")) {
      const result = resolveAsset(source, page.sourcePath, files);
      if (result.status === "ok" && result.value) {
        token.attrSet("src", encodeUrlPath(withBasePath(basePath, `/${result.value.path}`)));
      } else {
        diagnostics.push(linkDiagnostic("ASSET", failedStatus(result.status), source, page.sourcePath));
      }
    }
    return originalImage
      ? originalImage(tokens, index, options, environment, renderer)
      : renderer.renderToken(tokens, index, options);
  };

  markdown.renderer.rules.heading_open = (tokens, index, options, _environment, renderer) => {
    const token = tokens[index];
    const inline = tokens[index + 1];
    const text = inline?.content.trim() || "Section";
    const baseSlug = slugifyHeading(text);
    const count = headingCounts.get(baseSlug) ?? 0;
    headingCounts.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    const level = Number.parseInt(token?.tag.slice(1) ?? "1", 10);
    token?.attrSet("id", slug);
    headings.push({ level, text, slug });
    return renderer.renderToken(tokens, index, options);
  };

  const html = markdown.render(page.body);
  return { html, headings, plainText: markdownToPlainText(page.body), diagnostics };
}

function installWikilinks(
  markdown: MarkdownItInstance,
  page: PageRecord,
  pages: PageRecord[],
  files: SourceFile[],
  basePath: string,
  diagnostics: BuildDiagnostic[],
): void {
  markdown.inline.ruler.before("link", "obsidian-wikilink", (state: StateInline, silent: boolean) => {
    const tail = state.src.slice(state.pos);
    const match = /^(!)?\[\[([^\]]+)\]\]/.exec(tail);
    if (!match) return false;
    if (silent) return true;

    const isEmbed = match[1] === "!";
    const inner = match[2] ?? "";
    const [rawTarget = "", rawAlias] = inner.split("|", 2);
    const target = rawTarget.trim();
    const alias = rawAlias?.trim();
    const [pageTarget = "", anchor] = target.split("#", 2);

    if (isEmbed && looksLikeAsset(pageTarget)) {
      const resolved = resolveAsset(pageTarget, page.sourcePath, files);
      const token = state.push("html_inline", "", 0);
      if (resolved.status === "ok" && resolved.value) {
        const source = encodeUrlPath(withBasePath(basePath, `/${resolved.value.path}`));
        const dimensions = parseDimensions(alias);
        token.content = `<img class="internal-embed" src="${source}" alt="${escapeHtml(alias && !dimensions ? alias : pageTarget)}"${dimensions ?? ""}>`;
      } else {
        diagnostics.push(linkDiagnostic("ASSET", failedStatus(resolved.status), pageTarget, page.sourcePath));
        token.content = `<span class="broken-link">${escapeHtml(pageTarget)}</span>`;
      }
    } else {
      const resolved = pageTarget ? resolvePage(pageTarget, page.sourcePath, pages) : { status: "ok" as const, value: page };
      const label = alias || path.posix.basename(pageTarget || page.title) || page.title;
      if (resolved.status === "ok" && resolved.value) {
        const anchorSuffix = anchor ? `#${slugifyHeading(anchor)}` : "";
        const href = `${encodeUrlPath(withBasePath(basePath, resolved.value.route))}${anchorSuffix}`;
        const cssClass = isEmbed ? "note-embed" : "internal-link";
        const open = state.push("link_open", "a", 1);
        open.attrSet("href", href);
        open.attrSet("class", cssClass);
        const text = state.push("text", "", 0);
        text.content = label;
        state.push("link_close", "a", -1);
        if (isEmbed) {
          diagnostics.push({
            severity: "warning",
            code: "NOTE_EMBED_LINK_ONLY",
            message: `Note embed is rendered as a link in v1: ${pageTarget}`,
            path: page.sourcePath,
          });
        }
      } else {
        diagnostics.push(linkDiagnostic("WIKILINK", failedStatus(resolved.status), pageTarget, page.sourcePath));
        const token = state.push("html_inline", "", 0);
        token.content = `<span class="broken-link">${escapeHtml(label)}</span>`;
      }
    }
    state.pos += match[0].length;
    return true;
  });
}

function installCalloutsAndTasks(markdown: MarkdownItInstance): void {
  markdown.core.ruler.after("inline", "obsidian-callouts-and-tasks", (state: StateCore) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token?.type === "blockquote_open") {
        const inline = tokens.slice(index + 1).find((candidate) => candidate.type === "inline");
        const firstChild = inline?.children?.[0];
        const match = /^\[!([a-z0-9_-]+)\][+-]?\s*(.*)/i.exec(firstChild?.content ?? "");
        if (match && firstChild) {
          const kind = (match[1] ?? "note").toLocaleLowerCase("en");
          const title = match[2]?.trim() || kind;
          token.attrJoin("class", `callout callout-${kind}`);
          firstChild.type = "html_inline";
          firstChild.tag = "";
          firstChild.content = `<strong class="callout-title">${escapeHtml(title)}</strong>`;
        }
      }
      if (token?.type === "inline" && token.children) {
        for (const child of token.children) {
          const task = /^\[([ xX])\]\s+/.exec(child.content);
          if (child.type === "text" && task) {
            const checked = (task[1] ?? " ").toLocaleLowerCase("en") === "x";
            const label = child.content.slice(task[0].length);
            child.type = "html_inline";
            child.tag = "";
            child.content = `<label class="task-list-item"><input type="checkbox" disabled${checked ? " checked" : ""}> ${escapeHtml(label)}</label>`;
          }
        }
      }
    }
  });
}

function installMath(markdown: MarkdownItInstance, diagnostics: BuildDiagnostic[], sourcePath: string): void {
  markdown.inline.ruler.before("escape", "math-inline", (state: StateInline, silent: boolean) => {
    if (state.src[state.pos] !== "$" || state.src[state.pos + 1] === "$" || state.src[state.pos - 1] === "\\") return false;
    const end = findClosingDollar(state.src, state.pos + 1);
    if (end < 0) return false;
    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.content = state.src.slice(state.pos + 1, end);
    }
    state.pos = end + 1;
    return true;
  });
  markdown.renderer.rules.math_inline = (tokens: Token[], index: number) => renderMath(tokens[index]?.content ?? "", false, diagnostics, sourcePath);

  markdown.block.ruler.before("fence", "math-block", (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
    const start = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
    const maximum = state.eMarks[startLine] ?? start;
    const firstLine = state.src.slice(start, maximum).trim();
    if (!firstLine.startsWith("$$")) return false;
    let content = firstLine.slice(2);
    let nextLine = startLine;
    if (content.endsWith("$$") && content.length > 2) {
      content = content.slice(0, -2);
    } else {
      const lines: string[] = [content];
      let found = false;
      while (++nextLine < endLine) {
        const lineStart = (state.bMarks[nextLine] ?? 0) + (state.tShift[nextLine] ?? 0);
        const lineEnd = state.eMarks[nextLine] ?? lineStart;
        const line = state.src.slice(lineStart, lineEnd);
        if (line.trim().endsWith("$$")) {
          lines.push(line.replace(/\$\$\s*$/, ""));
          found = true;
          break;
        }
        lines.push(line);
      }
      if (!found) return false;
      content = lines.join("\n");
    }
    if (silent) return true;
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = content.trim();
    token.map = [startLine, nextLine + 1];
    state.line = nextLine + 1;
    return true;
  });
  markdown.renderer.rules.math_block = (tokens: Token[], index: number) => renderMath(tokens[index]?.content ?? "", true, diagnostics, sourcePath);
}

function renderMath(source: string, displayMode: boolean, diagnostics: BuildDiagnostic[], sourcePath: string): string {
  try {
    return katex.renderToString(source, { displayMode, output: "mathml", throwOnError: true, strict: "warn" });
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "INVALID_MATH",
      message: error instanceof Error ? error.message : String(error),
      path: sourcePath,
    });
    return `<span class="math-error">${escapeHtml(source)}</span>`;
  }
}

function resolvePage(target: string, currentSourcePath: string, pages: PageRecord[]): ResolveResult<PageRecord> {
  const normalizedTarget = stripMarkdownExtension(target.replaceAll("\\", "/")).replace(/^\//, "");
  const currentDirectory = path.posix.dirname(currentSourcePath);
  const relativeCandidate = normalizeProjectPath(path.posix.join(currentDirectory === "." ? "" : currentDirectory, normalizedTarget));
  const rootCandidate = normalizeProjectPath(normalizedTarget);
  const exact = pages.filter((candidate) => {
    const source = stripMarkdownExtension(candidate.sourcePath);
    return source === relativeCandidate || source === rootCandidate || source === `${relativeCandidate}/index` || source === `${rootCandidate}/index`;
  });
  if (exact.length === 1) return { status: "ok", value: exact[0]! };
  if (exact.length > 1) return { status: "ambiguous" };
  const basename = path.posix.basename(normalizedTarget).toLocaleLowerCase("en");
  const byName = pages.filter(
    (candidate) => path.posix.basename(stripMarkdownExtension(candidate.sourcePath)).toLocaleLowerCase("en") === basename,
  );
  if (byName.length === 1) return { status: "ok", value: byName[0]! };
  return { status: byName.length > 1 ? "ambiguous" : "missing" };
}

function resolveAsset(target: string, currentSourcePath: string, files: SourceFile[]): ResolveResult<SourceFile> {
  const cleanTarget = target.split("#", 1)[0]?.split("?", 1)[0] ?? target;
  const normalizedTarget = cleanTarget.replaceAll("\\", "/").replace(/^\//, "");
  const currentDirectory = path.posix.dirname(currentSourcePath);
  const candidates = new Set([
    normalizeProjectPath(path.posix.join(currentDirectory === "." ? "" : currentDirectory, normalizedTarget)),
    normalizeProjectPath(normalizedTarget),
  ]);
  const assets = files.filter((file) => !file.path.toLocaleLowerCase("en").endsWith(".md"));
  const exact = assets.filter((file) => candidates.has(normalizeProjectPath(file.path)));
  if (exact.length === 1) return { status: "ok", value: exact[0]! };
  if (exact.length > 1) return { status: "ambiguous" };
  const basename = path.posix.basename(normalizedTarget).toLocaleLowerCase("en");
  const byName = assets.filter((file) => path.posix.basename(file.path).toLocaleLowerCase("en") === basename);
  if (byName.length === 1) return { status: "ok", value: byName[0]! };
  return { status: byName.length > 1 ? "ambiguous" : "missing" };
}

function linkDiagnostic(kind: string, status: "missing" | "ambiguous", target: string, sourcePath: string): BuildDiagnostic {
  return {
    severity: "error",
    code: `${status === "missing" ? "BROKEN" : "AMBIGUOUS"}_${kind}`,
    message: `${status === "missing" ? "Cannot resolve" : "Ambiguous"} ${kind.toLocaleLowerCase("en")}: ${target}`,
    path: sourcePath,
  };
}

function failedStatus(status: ResolveResult<unknown>["status"]): "missing" | "ambiguous" {
  return status === "ambiguous" ? "ambiguous" : "missing";
}

function looksLikeAsset(target: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg|pdf|mp3|mp4|webm)$/i.test(target);
}

function parseDimensions(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{1,5})(?:x(\d{1,5}))?$/.exec(value);
  if (!match) return undefined;
  return ` width="${match[1]}"${match[2] ? ` height="${match[2]}"` : ""}`;
}

function isExternalUrl(value: string): boolean {
  return /^(?:https?:|mailto:|tel:|obsidian:|data:)/i.test(value);
}

function findClosingDollar(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "$" && source[index - 1] !== "\\" && source[index - 1] !== " ") return index;
  }
  return -1;
}

export function markdownToPlainText(source: string): string {
  return source
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/!\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2 $1")
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/[#>*_~\[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function renderTableOfContents(headings: HeadingRecord[]): string {
  const relevant = headings.filter((heading) => heading.level >= 2 && heading.level <= 4);
  if (relevant.length === 0) return "";
  return `<nav class="table-of-contents" aria-label="Table of contents"><strong>On this page</strong><ol>${relevant
    .map(
      (heading) =>
        `<li class="toc-level-${heading.level}"><a href="#${encodeURIComponent(heading.slug)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join("")}</ol></nav>`;
}
