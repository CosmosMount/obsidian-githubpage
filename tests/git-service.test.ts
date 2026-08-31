import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitService } from "../packages/plugin/src/git-service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("Git collaboration service", () => {
  it("preserves authored commits and stops safely on branch divergence", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "githubpage-git-"));
    temporaryDirectories.push(base);
    const remote = path.join(base, "remote.git");
    const seed = path.join(base, "seed");
    const alice = path.join(base, "alice");
    const secondDevice = path.join(base, "alice-second");

    git(base, "init", "--bare", remote);
    await fs.mkdir(seed);
    git(seed, "init", "-b", "main");
    configureIdentity(seed, "Maintainer", "maintainer@example.com");
    await fs.writeFile(path.join(seed, "index.md"), "base\n");
    git(seed, "add", "index.md");
    git(seed, "commit", "-m", "initial");
    git(seed, "remote", "add", "origin", remote);
    git(seed, "push", "-u", "origin", "main");

    git(base, "clone", remote, alice);
    configureIdentity(alice, "Alice", "alice@example.com");
    const service = new GitService(alice, () => "main");
    await service.checkRepository();
    await fs.writeFile(path.join(alice, "direct.md"), "direct mode\n");
    await expect(service.commitSelected(["direct.md"], "Direct main change")).rejects.toThrow("Direct commits to main are disabled");
    const directService = new GitService(alice, () => "main", () => true);
    await directService.commitSelected(["direct.md"], "Direct main change");
    await directService.pushCurrentBranch();
    expect(git(alice, "log", "-1", "--format=%s").trim()).toBe("Direct main change");
    const nested = path.join(alice, "nested-vault");
    await fs.mkdir(nested);
    await expect(new GitService(nested, () => "main").checkRepository()).rejects.toThrow("configured folder must also be the Git repository root");
    let configuredRoot = alice;
    const configurableService = new GitService(() => configuredRoot, () => "main", () => true);
    await expect(configurableService.checkRepository()).resolves.toBeUndefined();
    configuredRoot = nested;
    await expect(configurableService.checkRepositoryRoot()).rejects.toThrow("configured folder must also be the Git repository root");
    configuredRoot = alice;
    await expect(configurableService.getCurrentBranch()).resolves.toBe("main");
    expect(await service.getIdentity()).toEqual({ name: "Alice", email: "alice@example.com" });
    await fs.writeFile(path.join(alice, "index.md"), "alice first\n");
    expect(await service.createCollaborationBranch("alice", "home")).toBe("author/alice/home");
    expect(await fs.readFile(path.join(alice, "index.md"), "utf8")).toBe("alice first\n");
    await service.commitSelected(["index.md"], "Alice first change");
    await service.syncCurrentBranch();

    git(base, "clone", remote, secondDevice);
    configureIdentity(secondDevice, "Alice second device", "alice@example.com");
    git(secondDevice, "switch", "-c", "author/alice/home", "origin/author/alice/home");
    await fs.writeFile(path.join(secondDevice, "index.md"), "remote advance\n");
    git(secondDevice, "add", "index.md");
    git(secondDevice, "commit", "-m", "Remote advance");
    git(secondDevice, "push", "origin", "author/alice/home");

    await fs.writeFile(path.join(alice, "index.md"), "local advance\n");
    await service.commitSelected(["index.md"], "Local advance");
    await expect(service.syncCurrentBranch()).rejects.toMatchObject({ exitCode: 128 });
    expect(await fs.readFile(path.join(alice, "index.md"), "utf8")).toBe("local advance\n");
    expect(await service.getConflictedPaths()).toEqual([]);
  }, 30_000);
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
}

function configureIdentity(repository: string, name: string, email: string): void {
  git(repository, "config", "user.name", name);
  git(repository, "config", "user.email", email);
}
