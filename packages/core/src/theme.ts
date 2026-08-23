import Handlebars from "handlebars";
import { GithubPageError } from "./errors";
import { escapeHtml, isSafeRelativePath } from "./paths";
import type { LoadedTheme } from "./types";

const forbiddenTemplatePatterns: Array<[RegExp, string]> = [
  [/<\s*script\b/i, "script elements are not allowed"],
  [/\son[a-z]+\s*=/i, "event handler attributes are not allowed"],
  [/javascript\s*:/i, "javascript URLs are not allowed"],
  [/<\s*(?:iframe|object|embed)\b/i, "embedded executable documents are not allowed"],
  [/<\s*link\b[^>]*href\s*=\s*["']?https?:/i, "external stylesheets are not allowed"],
  [/\s(?:src|href)\s*=\s*["']?https?:/i, "external template resources are not allowed"],
  [/<\s*meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, "meta refresh is not allowed"],
];

const forbiddenCssPatterns: Array<[RegExp, string]> = [
  [/@import\b/i, "CSS @import is not allowed"],
  [/url\(\s*["']?https?:/i, "external CSS URLs are not allowed"],
  [/expression\s*\(/i, "CSS expressions are not allowed"],
  [/javascript\s*:/i, "javascript URLs are not allowed"],
];

export function validateTheme(theme: LoadedTheme): void {
  for (const [pattern, message] of forbiddenTemplatePatterns) {
    if (pattern.test(theme.template)) throw new GithubPageError("UNSAFE_THEME_TEMPLATE", message);
  }
  for (const [pattern, message] of forbiddenCssPatterns) {
    if (pattern.test(theme.css)) throw new GithubPageError("UNSAFE_THEME_CSS", message);
  }
  if (!theme.template.includes("{{{head}}}")) {
    throw new GithubPageError("INVALID_THEME_TEMPLATE", "layout template must include {{{head}}}");
  }
  if (!theme.template.includes("{{{content}}}")) {
    throw new GithubPageError("INVALID_THEME_TEMPLATE", "layout template must include {{{content}}}");
  }
  if (!theme.template.includes("{{{runtime}}}")) {
    throw new GithubPageError("INVALID_THEME_TEMPLATE", "layout template must include {{{runtime}}}");
  }
  if (!isSafeRelativePath(theme.manifest.layout.template)) {
    throw new GithubPageError("INVALID_THEME_TEMPLATE_PATH", "theme layout path is unsafe");
  }
  for (const asset of theme.assets) {
    if (!isSafeRelativePath(asset.path)) {
      throw new GithubPageError("INVALID_THEME_ASSET_PATH", `theme asset path is unsafe: ${asset.path}`);
    }
    if (asset.path.toLocaleLowerCase("en").endsWith(".svg")) validateSvgAsset(asset.content, asset.path);
  }
}

function validateSvgAsset(content: string | Uint8Array, assetPath: string): void {
  const source = typeof content === "string" ? content : new TextDecoder().decode(content);
  if (/<\s*script\b|\son[a-z]+\s*=|javascript\s*:|\s(?:href|src)\s*=\s*["']?https?:/i.test(source)) {
    throw new GithubPageError("UNSAFE_THEME_SVG", `theme SVG contains active or external content: ${assetPath}`);
  }
}

export type ThemeContext = Record<string, string | boolean>;

export function renderTheme(theme: LoadedTheme, context: ThemeContext): string {
  const template = Handlebars.compile(theme.template, {
    strict: true,
    noEscape: false,
    preventIndent: true,
  });
  return `<!doctype html>\n${template(context)}`;
}

export function renderThemeTokens(tokens: Record<string, string>): string {
  const declarations = Object.entries(tokens)
    .filter(([name]) => /^[a-z][a-z0-9-]*$/i.test(name))
    .map(([name, value]) => `  --${name}: ${sanitizeCssToken(value)};`)
    .join("\n");
  return declarations ? `:root {\n${declarations}\n}\n` : "";
}

function sanitizeCssToken(value: string): string {
  if (/[{};]|url\s*\(|@import|javascript:/i.test(value)) {
    throw new GithubPageError("UNSAFE_THEME_TOKEN", `unsafe theme token value: ${escapeHtml(value)}`);
  }
  return value.trim();
}
