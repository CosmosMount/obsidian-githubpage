import path from "node:path";

const posix = path.posix;

export function normalizeProjectPath(value: string): string {
  const replaced = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const normalized = posix.normalize(replaced);
  return normalized === "." ? "" : normalized.replace(/^\/+/, "");
}

export function isSafeRelativePath(value: string): boolean {
  if (!value || value.includes("\0") || path.isAbsolute(value)) return false;
  const normalized = normalizeProjectPath(value);
  return normalized !== ".." && !normalized.startsWith("../");
}

export function sourcePathToRoute(sourcePath: string): string {
  const normalized = normalizeProjectPath(sourcePath);
  const withoutExtension = normalized.replace(/\.md$/i, "");
  if (withoutExtension.toLowerCase() === "index") return "/";
  if (withoutExtension.toLowerCase().endsWith("/index")) {
    return `/${withoutExtension.slice(0, -"/index".length)}/`;
  }
  return `/${withoutExtension}/`;
}

export function routeToOutputPath(route: string): string {
  const normalized = route.replace(/^\/+/, "");
  return normalized ? `${normalized.replace(/\/$/, "")}/index.html` : "index.html";
}

export function basePathFromUrl(baseUrl: string): string {
  const pathname = new URL(baseUrl).pathname.replace(/\/+$/, "");
  return pathname === "/" ? "" : pathname;
}

export function withBasePath(basePath: string, route: string): string {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${basePath}${normalizedRoute}` || "/";
}

export function encodeUrlPath(value: string): string {
  const hasTrailingSlash = value.endsWith("/");
  const encoded = value
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponentSafe(segment)))
    .join("/");
  return hasTrailingSlash && !encoded.endsWith("/") ? `${encoded}/` : encoded;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, "");
}

export function slugifyHeading(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}\-\u4e00-\u9fff]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function stableFingerprint(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
