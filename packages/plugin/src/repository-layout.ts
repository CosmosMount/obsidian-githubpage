import { promises as fs } from "node:fs";
import path from "node:path";

export type RepositoryMode = "vault" | "subfolder";

export interface DetectedRepository {
  mode: RepositoryMode;
  subfolder: string;
  label: string;
}

const IGNORED_DIRECTORIES = new Set([".git", ".githubpage", "node_modules", "_site"]);

export function resolveRepositoryRoot(vaultRoot: string, mode: RepositoryMode, subfolder: string): string {
  const root = path.resolve(vaultRoot);
  if (mode === "vault") return root;

  const normalized = normalizeRepositorySubfolder(subfolder);
  if (!normalized) throw new Error("Choose a repository folder inside this Vault");
  const repositoryRoot = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, repositoryRoot);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The repository folder must stay inside this Vault");
  }
  return repositoryRoot;
}

export function normalizeRepositorySubfolder(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized || normalized === ".") return "";
  if (
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Use a safe Vault-relative repository folder, for example Sites/MyNotes");
  }
  return normalized;
}

export function repositoryPathFromVaultPath(
  vaultRoot: string,
  repositoryRoot: string,
  vaultPath: string,
): string | undefined {
  const prefix = repositoryVaultPrefix(vaultRoot, repositoryRoot);
  const normalized = vaultPath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!prefix) return normalized;
  if (normalized === prefix) return "";
  return normalized.startsWith(`${prefix}/`) ? normalized.slice(prefix.length + 1) : undefined;
}

export function repositoryVaultPrefix(vaultRoot: string, repositoryRoot: string): string {
  const root = path.resolve(vaultRoot);
  const repository = path.resolve(repositoryRoot);
  const relative = path.relative(root, repository);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The repository folder must stay inside this Vault");
  }
  return relative.replaceAll("\\", "/");
}

export async function discoverGitRepositories(
  vaultRoot: string,
  configDir: string,
  maxDepth = 3,
): Promise<DetectedRepository[]> {
  const root = path.resolve(vaultRoot);
  const configDirectory = configDir.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  const repositories: DetectedRepository[] = [];

  const visit = async (directory: string, relativeDirectory: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.name === ".git" && (entry.isDirectory() || entry.isFile()))) {
      repositories.push({
        mode: relativeDirectory ? "subfolder" : "vault",
        subfolder: relativeDirectory,
        label: relativeDirectory || "Vault root",
      });
    }
    if (depth >= maxDepth) return;

    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            !IGNORED_DIRECTORIES.has(entry.name) &&
            !entry.name.startsWith("."),
        )
        .map((entry) => {
          const childRelative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
          return { entry, childRelative };
        })
        .filter(({ childRelative }) => childRelative !== configDirectory)
        .map(({ entry, childRelative }) => visit(path.join(directory, entry.name), childRelative, depth + 1)),
    );
  };

  await visit(root, "", 0);
  return repositories.sort((left, right) => left.label.localeCompare(right.label, "en", { numeric: true }));
}
