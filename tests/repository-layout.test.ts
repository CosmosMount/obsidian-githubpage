import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverGitRepositories,
  normalizeRepositorySubfolder,
  repositoryPathFromVaultPath,
  resolveRepositoryRoot,
} from "../packages/plugin/src/repository-layout";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("repository layout", () => {
  it("resolves Vault and nested repository roots without allowing escape paths", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "githubpage-layout-"));
    temporaryDirectories.push(vault);
    const nested = path.join(vault, "Sites", "Notes");
    await fs.mkdir(nested, { recursive: true });

    expect(resolveRepositoryRoot(vault, "vault", "ignored")).toBe(path.resolve(vault));
    expect(resolveRepositoryRoot(vault, "subfolder", "./Sites\\Notes/")).toBe(path.resolve(nested));
    expect(normalizeRepositorySubfolder(" ./Sites\\Notes/ ")).toBe("Sites/Notes");
    expect(() => resolveRepositoryRoot(vault, "subfolder", "../outside")).toThrow("safe Vault-relative");
    expect(() => resolveRepositoryRoot(vault, "subfolder", "C:/outside")).toThrow("safe Vault-relative");
    expect(() => resolveRepositoryRoot(vault, "subfolder", ".")).toThrow("Choose a repository folder");
  });

  it("maps Obsidian Vault paths to and from the selected repository", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "githubpage-layout-"));
    temporaryDirectories.push(vault);
    const repository = path.join(vault, "Sites", "Notes");
    await fs.mkdir(repository, { recursive: true });

    expect(repositoryPathFromVaultPath(vault, repository, "Sites/Notes/Guides/Start.md")).toBe("Guides/Start.md");
    expect(repositoryPathFromVaultPath(vault, repository, "Private/Journal.md")).toBeUndefined();
    expect(repositoryPathFromVaultPath(vault, vault, "Guides/Start.md")).toBe("Guides/Start.md");
  });

  it("detects Git roots in the Vault and nested folders while ignoring support directories", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "githubpage-layout-"));
    temporaryDirectories.push(vault);
    await Promise.all([
      fs.mkdir(path.join(vault, ".git"), { recursive: true }),
      fs.mkdir(path.join(vault, "Sites", "Notes", ".git"), { recursive: true }),
      fs.mkdir(path.join(vault, "node_modules", "ignored", ".git"), { recursive: true }),
      fs.mkdir(path.join(vault, "VaultConfig", "ignored", ".git"), { recursive: true }),
    ]);

    await expect(discoverGitRepositories(vault, "VaultConfig")).resolves.toEqual([
      { mode: "subfolder", subfolder: "Sites/Notes", label: "Sites/Notes" },
      { mode: "vault", subfolder: "", label: "Vault root" },
    ]);
  });

  it("skips only the complete nested configuration path", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "githubpage-layout-"));
    temporaryDirectories.push(vault);
    await Promise.all([
      fs.mkdir(path.join(vault, "Settings", "Obsidian", "ignored", ".git"), { recursive: true }),
      fs.mkdir(path.join(vault, "Settings", "Site", ".git"), { recursive: true }),
    ]);

    await expect(discoverGitRepositories(vault, "Settings/Obsidian")).resolves.toEqual([
      { mode: "subfolder", subfolder: "Settings/Site", label: "Settings/Site" },
    ]);
  });
});
