import { promises as fs } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

export const STARTER_ARCHIVE_URL =
  "https://github.com/CosmosMount/obsidian-githubpage/releases/latest/download/obsidian-githubpage-starter-vault.zip";

const MAX_ARCHIVE_FILES = 200;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

export interface StarterFile {
  path: string;
  data: Uint8Array;
}

export type StarterInstallMode = "full" | "compact";

const COMPACT_PATHS = [".githubpage/", ".github/workflows/pages.yml"];
const SUPPORT_DIRECTORIES = new Set([".git", ".obsidian", ".githubpage", ".github", "_site", "node_modules"]);

export async function installStarterArchive(
  vaultRoot: string,
  archive: ArrayBuffer,
  mode: StarterInstallMode = "full",
): Promise<number> {
  const files = selectStarterFiles(parseStarterArchive(archive), mode);
  if (files.length === 0) throw new Error("The Starter Vault archive is empty");

  const targets = files.map((file) => ({ ...file, target: safeTarget(vaultRoot, file.path) }));
  const existing = await findExistingTargets(targets.map((file) => file.target));
  if (existing.length > 0) {
    throw new Error(`Starter Vault would overwrite existing files: ${existing.slice(0, 5).join(", ")}`);
  }

  const stagingRoot = await fs.mkdtemp(path.join(vaultRoot, ".githubpage-init-"));
  const movedTargets: string[] = [];
  try {
    for (const file of targets) {
      const staged = path.join(stagingRoot, file.path);
      await fs.mkdir(path.dirname(staged), { recursive: true });
      await fs.writeFile(staged, file.data);
    }
    for (const file of targets) {
      const staged = path.join(stagingRoot, file.path);
      await fs.mkdir(path.dirname(file.target), { recursive: true });
      await fs.rename(staged, file.target);
      movedTargets.push(file.target);
    }
    return targets.length;
  } catch (error) {
    await Promise.all(movedTargets.map((target) => fs.rm(target, { force: true })));
    throw error;
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

/**
 * Returns true when a Vault already contains user-facing content. Obsidian's
 * own metadata and GitHubPage support directories do not count, so a freshly
 * cloned repository still receives the complete starter example.
 */
export async function vaultHasUserContent(vaultRoot: string): Promise<boolean> {
  const entries = await fs.readdir(vaultRoot, { withFileTypes: true });
  return entries.some((entry) => !SUPPORT_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".githubpage-init-"));
}

export function selectStarterFiles(files: StarterFile[], mode: StarterInstallMode): StarterFile[] {
  if (mode === "full") return files;
  return files.filter((file) => COMPACT_PATHS.some((prefix) => file.path === prefix || file.path.startsWith(prefix)));
}

export function parseStarterArchive(archive: ArrayBuffer): StarterFile[] {
  const entries = unzipSync(new Uint8Array(archive));
  const files: StarterFile[] = [];
  let totalBytes = 0;
  for (const [rawPath, data] of Object.entries(entries)) {
    if (rawPath.endsWith("/")) continue;
    const normalized = normalizeArchivePath(rawPath);
    totalBytes += data.byteLength;
    if (files.length >= MAX_ARCHIVE_FILES) throw new Error("The Starter Vault archive contains too many files");
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("The Starter Vault archive is too large");
    files.push({ path: normalized, data });
  }
  return files;
}

function normalizeArchivePath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe Starter Vault archive path: ${value}`);
  }
  return normalized;
}

function safeTarget(root: string, relativePath: string): string {
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe Starter Vault target path: ${relativePath}`);
  }
  return target;
}

async function findExistingTargets(targets: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const target of targets) {
    try {
      await fs.access(target);
      existing.push(target);
    } catch {
      // Missing targets are expected during first-time initialization.
    }
  }
  return existing;
}
