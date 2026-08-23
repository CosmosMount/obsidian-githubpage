import { spawn } from "node:child_process";
import path from "node:path";

export interface GitStatusEntry {
  indexStatus: string;
  workTreeStatus: string;
  path: string;
  originalPath?: string;
}

export interface GitIdentity {
  name: string;
  email: string;
}

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class GitCommandError extends Error {
  constructor(
    public readonly args: string[],
    public readonly exitCode: number,
    message: string,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

export class GitService {
  private operationQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repositoryRoot: string,
    private readonly mainBranch: () => string,
  ) {}

  async checkRepository(): Promise<void> {
    await this.run(["--version"]);
    const inside = await this.run(["rev-parse", "--is-inside-work-tree"]);
    if (inside.stdout.trim() !== "true") throw new GitCommandError([], 1, "The Vault root is not a Git working tree");
    const prefix = (await this.run(["rev-parse", "--show-prefix"])).stdout.trim();
    if (prefix) {
      throw new GitCommandError([], 1, "The Vault root must also be the Git repository root");
    }
    await this.run(["remote", "get-url", "origin"]);
    await this.getIdentity();
  }

  async getIdentity(): Promise<GitIdentity> {
    const [name, email] = await Promise.all([
      this.run(["config", "--get", "user.name"], true),
      this.run(["config", "--get", "user.email"], true),
    ]);
    if (!name.stdout.trim() || !email.stdout.trim()) {
      throw new GitCommandError([], 1, "Configure git user.name and user.email for this repository before committing");
    }
    return { name: name.stdout.trim(), email: email.stdout.trim() };
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.run(["branch", "--show-current"]);
    const branch = result.stdout.trim();
    if (!branch) throw new GitCommandError([], 1, "Detached HEAD is not supported");
    return branch;
  }

  async getStatus(): Promise<GitStatusEntry[]> {
    const result = await this.run(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    return parsePorcelainStatus(result.stdout);
  }

  async createCollaborationBranch(authorSlug: string, taskSlug: string): Promise<string> {
    return this.exclusive(async () => {
      validateRefPart(authorSlug, "author name");
      validateRefPart(taskSlug, "task name");
      await this.requireCleanWorkingTree();
      await this.run(["fetch", "origin", this.mainBranch()]);
      const branch = `author/${authorSlug}/${taskSlug}`;
      await this.run(["check-ref-format", "--branch", branch]);
      await this.run(["switch", "-c", branch, `origin/${this.mainBranch()}`]);
      return branch;
    });
  }

  async commitSelected(paths: string[], message: string): Promise<void> {
    return this.exclusive(async () => {
      const branch = await this.getCurrentBranch();
      if (branch === this.mainBranch()) {
        throw new GitCommandError([], 1, `Direct commits to ${branch} are disabled; create a collaboration branch first`);
      }
      const normalizedMessage = message.trim();
      if (!normalizedMessage) throw new GitCommandError([], 1, "A commit message is required");
      const safePaths = paths.map(validateRepositoryPath);
      if (safePaths.length === 0) throw new GitCommandError([], 1, "Select at least one changed file");
      await this.run(["add", "--", ...safePaths]);
      await this.run(["commit", "-m", normalizedMessage]);
    });
  }

  async pullCurrentBranch(): Promise<void> {
    return this.exclusive(async () => this.pullCurrentBranchUnsafe());
  }

  async pushCurrentBranch(): Promise<void> {
    return this.exclusive(async () => this.pushCurrentBranchUnsafe());
  }

  async syncCurrentBranch(): Promise<void> {
    return this.exclusive(async () => {
      await this.requireCleanWorkingTree();
      await this.pullCurrentBranchUnsafe();
      if ((await this.getCurrentBranch()) !== this.mainBranch()) await this.pushCurrentBranchUnsafe();
    });
  }

  async updateFromMain(): Promise<void> {
    return this.exclusive(async () => {
      await this.requireCleanWorkingTree();
      const branch = await this.getCurrentBranch();
      if (branch === this.mainBranch()) throw new GitCommandError([], 1, "Already on the main branch");
      await this.run(["fetch", "origin", this.mainBranch()]);
      await this.run(["merge", "--no-edit", `origin/${this.mainBranch()}`]);
    });
  }

  async getConflictedPaths(): Promise<string[]> {
    const result = await this.run(["diff", "--name-only", "--diff-filter=U", "-z"], true);
    return result.stdout
      .split("\0")
      .filter(Boolean)
      .map(validateRepositoryPath);
  }

  async abortInProgressOperation(): Promise<boolean> {
    return this.exclusive(async () => {
      for (const operation of [["merge", "--abort"], ["rebase", "--abort"], ["cherry-pick", "--abort"]]) {
        const result = await this.run(operation, true);
        if (result.code === 0) return true;
      }
      return false;
    });
  }

  async getPullRequestUrl(): Promise<string> {
    const [remote, branch] = await Promise.all([this.run(["remote", "get-url", "origin"]), this.getCurrentBranch()]);
    const repository = parseGithubRepository(remote.stdout.trim());
    if (!repository) throw new GitCommandError([], 1, "origin is not a supported github.com URL");
    return `https://github.com/${repository.owner}/${repository.name}/compare/${encodeURIComponent(this.mainBranch())}...${encodeURIComponent(branch)}?expand=1`;
  }

  private async pullCurrentBranchUnsafe(): Promise<void> {
    await this.requireCleanWorkingTree();
    const branch = await this.getCurrentBranch();
    await this.run(["fetch", "origin"]);
    const remoteRef = `refs/remotes/origin/${branch}`;
    const exists = await this.run(["show-ref", "--verify", "--quiet", remoteRef], true);
    if (exists.code === 0) {
      await this.run(["merge", "--ff-only", `origin/${branch}`]);
    }
  }

  private async pushCurrentBranchUnsafe(): Promise<void> {
    const branch = await this.getCurrentBranch();
    if (branch === this.mainBranch()) throw new GitCommandError([], 1, `Direct pushes to ${branch} are disabled`);
    await this.run(["push", "--set-upstream", "origin", branch]);
  }

  private async requireCleanWorkingTree(): Promise<void> {
    const status = await this.getStatus();
    if (status.length > 0) {
      throw new GitCommandError([], 1, "Commit or discard all working tree changes before syncing");
    }
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue.catch(() => undefined);
    let release!: () => void;
    this.operationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private run(args: string[], allowFailure = false): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", args, {
        cwd: this.repositoryRoot,
        shell: false,
        windowsHide: true,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", (error) => reject(new GitCommandError(args, -1, `Cannot start Git: ${error.message}`)));
      child.once("close", (code) => {
        const result = {
          code: code ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: redactCredentials(Buffer.concat(stderr).toString("utf8")).trim(),
        };
        if (result.code !== 0 && !allowFailure) {
          reject(new GitCommandError(args, result.code, result.stderr || `git ${args[0] ?? "command"} failed`));
        } else {
          resolve(result);
        }
      });
    });
  }
}

function parsePorcelainStatus(value: string): GitStatusEntry[] {
  const records = value.split("\0");
  const entries: GitStatusEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const indexStatus = record[0] ?? " ";
    const workTreeStatus = record[1] ?? " ";
    const filePath = validateRepositoryPath(record.slice(3));
    if (indexStatus === "R" || indexStatus === "C") {
      const originalPath = records[++index];
      entries.push({ indexStatus, workTreeStatus, path: filePath, ...(originalPath ? { originalPath } : {}) });
    } else {
      entries.push({ indexStatus, workTreeStatus, path: filePath });
    }
  }
  return entries;
}

function validateRepositoryPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.includes("\0") || path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new GitCommandError([], 1, `Unsafe repository path: ${value}`);
  }
  return normalized;
}

function validateRefPart(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/i.test(value)) {
    throw new GitCommandError([], 1, `Invalid ${label}: use letters, numbers, dash or underscore`);
  }
}

function parseGithubRepository(remote: string): { owner: string; name: string } | undefined {
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(remote);
  const https = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(remote);
  const match = ssh ?? https;
  const owner = match?.[1];
  const name = match?.[2];
  return owner && name ? { owner, name } : undefined;
}

function redactCredentials(value: string): string {
  return value.replace(/(https?:\/\/)[^/@\s]+@/gi, "$1***@");
}
