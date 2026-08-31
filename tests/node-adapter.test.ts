import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProject, loadProject, writeBuildResult } from "@obsidian-githubpage/node-adapter";
import { config } from "./helpers";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("Node project adapter", () => {
  it("loads a Vault and writes the exact in-memory artifact", async () => {
    const root = await createVault();
    const project = await loadProject(root);
    expect(project.files.map((file) => file.path)).toEqual(["Guide.md", "index.md"]);
    const result = await buildProject(root);
    const output = await writeBuildResult(root, "_site", result);
    expect(output).toBe(path.join(root, "_site"));
    for (const item of result.outputs.values()) {
      const written = await fs.readFile(path.join(output, ...item.path.split("/")));
      const expected = typeof item.content === "string" ? Buffer.from(item.content) : Buffer.from(item.content);
      expect(written.equals(expected), item.path).toBe(true);
    }
  });

  it("refuses dangerous output directories", async () => {
    const root = await createVault();
    const result = await buildProject(root);
    await expect(writeBuildResult(root, ".", result)).rejects.toMatchObject({ code: "UNSAFE_OUTPUT_PATH" });
    await expect(writeBuildResult(root, ".githubpage/output", result)).rejects.toMatchObject({ code: "UNSAFE_OUTPUT_PATH" });
    await expect(writeBuildResult(root, ".custom-config/output", result)).rejects.toMatchObject({
      code: "UNSAFE_OUTPUT_PATH",
    });
  });

  it("migrates a compatible site engine pin when requested by the plugin", async () => {
    const root = await createVault();
    const configPath = path.join(root, ".githubpage", "site.json");
    const previous = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
    previous.engineVersion = "1.0.0";
    await fs.writeFile(configPath, JSON.stringify(previous));

    await expect(loadProject(root)).rejects.toMatchObject({ code: "ENGINE_VERSION_MISMATCH" });
    await expect(loadProject(root, { migrateEngineVersion: true })).resolves.toBeTruthy();
    const migrated = JSON.parse(await fs.readFile(configPath, "utf8")) as { engineVersion: string };
    expect(migrated.engineVersion).toBe("1.1.1");

    const future = JSON.parse(await fs.readFile(configPath, "utf8")) as Record<string, unknown>;
    future.engineVersion = "2.0.0";
    await fs.writeFile(configPath, JSON.stringify(future));
    await expect(loadProject(root, { migrateEngineVersion: true })).rejects.toMatchObject({ code: "ENGINE_VERSION_MISMATCH" });
  });
});

async function createVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "githubpage-adapter-"));
  temporaryDirectories.push(root);
  await fs.mkdir(path.join(root, ".githubpage"), { recursive: true });
  await fs.writeFile(path.join(root, ".githubpage", "site.json"), JSON.stringify(config));
  await fs.cp(path.resolve("packages/default-theme/theme"), path.join(root, ".githubpage", "theme"), { recursive: true });
  await fs.writeFile(path.join(root, "index.md"), "# Home\n\n[[Guide]]");
  await fs.writeFile(path.join(root, "Guide.md"), "# Guide");
  await fs.writeFile(path.join(root, "README.md"), "excluded");
  await fs.mkdir(path.join(root, ".vault-config"));
  await fs.writeFile(path.join(root, ".vault-config", "workspace.json"), "{}");
  return root;
}
