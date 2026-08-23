import { promises as fs } from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import {
  buildSite,
  GithubPageError,
  normalizeProjectPath,
  parseSiteConfig,
  parseThemeManifest,
  type BuildCache,
  type BuildDiagnostic,
  type BuildResult,
  type LoadedTheme,
  type ProjectInput,
  type SiteConfig,
  type SourceFile,
} from "@obsidian-githubpage/core";

const CONFIG_PATH = ".githubpage/site.json";

export async function loadProject(vaultRoot: string): Promise<ProjectInput> {
  const root = path.resolve(vaultRoot);
  const configRaw = await readUtf8(resolveInside(root, CONFIG_PATH), "site configuration");
  const config = parseSiteConfig(configRaw);
  const theme = await loadTheme(root, config);
  const files = await loadContent(root, config);
  return { config, theme, files };
}

export async function buildProject(vaultRoot: string, previous?: BuildCache): Promise<BuildResult> {
  return buildSite(await loadProject(vaultRoot), previous);
}

export async function writeBuildResult(vaultRoot: string, outputDirectory: string, result: BuildResult): Promise<string> {
  const root = path.resolve(vaultRoot);
  const destination = resolveOutput(root, outputDirectory);
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await fs.rm(temporary, { recursive: true, force: true });
  await fs.mkdir(temporary, { recursive: true });
  try {
    for (const output of result.outputs.values()) {
      const target = resolveInside(temporary, output.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, output.content);
    }
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

export function diagnosticsHaveErrors(diagnostics: BuildDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function formatDiagnostics(diagnostics: BuildDiagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const location = diagnostic.path ? `${diagnostic.path}: ` : "";
      return `${diagnostic.severity.toLocaleUpperCase("en")} ${diagnostic.code} ${location}${diagnostic.message}`;
    })
    .join("\n");
}

async function loadTheme(root: string, config: SiteConfig): Promise<LoadedTheme> {
  const themeRoot = resolveInside(root, config.theme.path);
  const manifestRaw = await readUtf8(resolveInside(themeRoot, "theme.json"), "theme manifest");
  const manifest = parseThemeManifest(manifestRaw);
  const template = await readUtf8(resolveInside(themeRoot, manifest.layout.template), "theme layout");
  const css = await readUtf8(resolveInside(themeRoot, "styles.css"), "theme stylesheet");
  const ignored = new Set(["theme.json", normalizeProjectPath(manifest.layout.template), "styles.css"]);
  const assets = (await walkFiles(themeRoot))
    .filter((filePath) => !ignored.has(filePath))
    .map(async (filePath): Promise<SourceFile> => ({
      path: filePath,
      content: new Uint8Array(await fs.readFile(resolveInside(themeRoot, filePath))),
      mediaType: mediaTypeForPath(filePath),
    }));
  return { manifest, template, css, assets: await Promise.all(assets) };
}

async function loadContent(root: string, config: SiteConfig): Promise<SourceFile[]> {
  const contentRoot = config.content.root === "." ? root : resolveInside(root, config.content.root);
  const matchesExcluded = picomatch(config.content.exclude, { dot: false });
  const allowedAssets = new Set(config.content.assetExtensions.map((extension) => extension.toLocaleLowerCase("en")));
  const paths = await walkFiles(contentRoot, true);
  const files: SourceFile[] = [];
  for (const filePath of paths) {
    if (matchesExcluded(filePath)) continue;
    const extension = path.posix.extname(filePath).toLocaleLowerCase("en");
    if (extension !== ".md" && !allowedAssets.has(extension)) continue;
    const absolute = resolveInside(contentRoot, filePath);
    if (extension === ".md") {
      files.push({ path: filePath, content: await fs.readFile(absolute, "utf8"), mediaType: "text/markdown; charset=utf-8" });
    } else {
      files.push({ path: filePath, content: new Uint8Array(await fs.readFile(absolute)), mediaType: mediaTypeForPath(filePath) });
    }
  }
  return files;
}

async function walkFiles(root: string, skipHiddenDirectories = false, relativeDirectory = ""): Promise<string[]> {
  const directory = relativeDirectory ? resolveInside(root, relativeDirectory) : root;
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new GithubPageError("READ_DIRECTORY_FAILED", `Cannot read directory: ${directory}`, error);
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (skipHiddenDirectories && entry.isDirectory() && entry.name.startsWith(".")) continue;
    if (entry.isDirectory() && ["node_modules", "_site"].includes(entry.name)) continue;
    const relativePath = normalizeProjectPath(path.posix.join(relativeDirectory.replaceAll("\\", "/"), entry.name));
    if (entry.isDirectory()) files.push(...(await walkFiles(root, skipHiddenDirectories, relativePath)));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function resolveOutput(root: string, outputDirectory: string): string {
  const destination = resolveInside(root, outputDirectory);
  const relative = normalizeProjectPath(path.relative(root, destination));
  const blocked = new Set(["", ".git", ".githubpage", ".obsidian"]);
  if (blocked.has(relative) || relative.startsWith(".git/") || relative.startsWith(".githubpage/") || relative.startsWith(".obsidian/")) {
    throw new GithubPageError("UNSAFE_OUTPUT_PATH", `Refusing to write build output to ${destination}`);
  }
  return destination;
}

function resolveInside(root: string, relativePath: string): string {
  if (relativePath.includes("\0")) throw new GithubPageError("UNSAFE_PATH", "Path contains a null byte");
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new GithubPageError("PATH_TRAVERSAL", `Path escapes its root: ${relativePath}`);
  }
  return resolved;
}

async function readUtf8(filePath: string, label: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new GithubPageError("READ_FILE_FAILED", `Cannot read ${label}: ${filePath}`, error);
  }
}

function mediaTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLocaleLowerCase("en");
  return (
    {
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
      ".css": "text/css; charset=utf-8",
    }[extension] ?? "application/octet-stream"
  );
}

export const projectPaths = { config: CONFIG_PATH } as const;
