import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { installStarterArchive, parseStarterArchive, vaultHasUserContent } from "../packages/plugin/src/starter-installer";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("Starter Vault installer", () => {
  it("installs nested text and binary files without changing their bytes", async () => {
    const root = await createTemporaryDirectory();
    const archive = toArrayBuffer(
      zipSync({
        ".githubpage/site.json": new TextEncoder().encode('{"schemaVersion":1}'),
        "assets/icon.bin": Uint8Array.from([0, 1, 2, 255]),
      }),
    );

    await expect(installStarterArchive(root, archive)).resolves.toBe(2);
    await expect(fs.readFile(path.join(root, ".githubpage/site.json"), "utf8")).resolves.toBe('{"schemaVersion":1}');
    await expect(fs.readFile(path.join(root, "assets/icon.bin"))).resolves.toEqual(Buffer.from([0, 1, 2, 255]));
  });

  it("refuses to overwrite any existing file before writing the archive", async () => {
    const root = await createTemporaryDirectory();
    await fs.writeFile(path.join(root, "index.md"), "keep me");
    const archive = toArrayBuffer(zipSync({ "index.md": new TextEncoder().encode("replace me"), "new.md": new TextEncoder().encode("new") }));

    await expect(installStarterArchive(root, archive)).rejects.toThrow("would overwrite existing files");
    await expect(fs.readFile(path.join(root, "index.md"), "utf8")).resolves.toBe("keep me");
    await expect(fs.access(path.join(root, "new.md"))).rejects.toThrow();
  });

  it("keeps existing Vault notes separate in compact mode", async () => {
    const root = await createTemporaryDirectory();
    await fs.writeFile(path.join(root, "My Note.md"), "keep me");
    await fs.mkdir(path.join(root, "VaultConfig"));
    const archive = toArrayBuffer(
      zipSync({
        ".githubpage/site.json": new TextEncoder().encode("config"),
        ".githubpage/theme/theme.json": new TextEncoder().encode("theme"),
        ".github/workflows/pages.yml": new TextEncoder().encode("workflow"),
        "index.md": new TextEncoder().encode("example"),
        "package-lock.json": new TextEncoder().encode("lockfile"),
      }),
    );

    await expect(vaultHasUserContent(root, path.join(root, "VaultConfig"))).resolves.toBe(true);
    await expect(installStarterArchive(root, archive, "compact")).resolves.toBe(3);
    await expect(fs.readFile(path.join(root, "My Note.md"), "utf8")).resolves.toBe("keep me");
    await expect(fs.access(path.join(root, "index.md"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "package-lock.json"))).rejects.toThrow();
    await expect(fs.readFile(path.join(root, ".githubpage/site.json"), "utf8")).resolves.toBe("config");
  });

  it("rejects archive path traversal", () => {
    const archive = toArrayBuffer(zipSync({ "../outside.txt": new TextEncoder().encode("unsafe") }));
    expect(() => parseStarterArchive(archive)).toThrow("Unsafe Starter Vault archive path");
  });

  it("does not treat a custom Vault configuration directory as user content", async () => {
    const root = await createTemporaryDirectory();
    await fs.mkdir(path.join(root, "VaultConfig"));
    await fs.writeFile(path.join(root, "VaultConfig", "workspace.json"), "{}");

    await expect(vaultHasUserContent(root, path.join(root, "VaultConfig"))).resolves.toBe(false);
    await fs.writeFile(path.join(root, "Note.md"), "# Note");
    await expect(vaultHasUserContent(root, path.join(root, "VaultConfig"))).resolves.toBe(true);
  });

  it("does not ignore a same-named user directory inside a nested repository", async () => {
    const vault = await createTemporaryDirectory();
    const repository = path.join(vault, "Sites", "Repo");
    const configDirectory = path.join(vault, "VaultConfig");
    await fs.mkdir(path.join(repository, "VaultConfig"), { recursive: true });
    await fs.writeFile(path.join(repository, "VaultConfig", "Note.md"), "# Note");
    await fs.mkdir(configDirectory);

    await expect(vaultHasUserContent(repository, configDirectory)).resolves.toBe(true);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "githubpage-starter-"));
  temporaryDirectories.push(directory);
  return directory;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
