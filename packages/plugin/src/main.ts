import { watch, type FSWatcher } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  FileSystemAdapter,
  Notice,
  Plugin,
  TFile,
  requestUrl,
  type TAbstractFile,
  type WorkspaceLeaf,
} from "obsidian";
import { messageFromUnknown } from "@obsidian-githubpage/core";
import { BuildCoordinator, type BuildState } from "./build-coordinator";
import { GitService } from "./git-service";
import { ConflictModal, GitStatusModal, PublishPanelModal, pickRepository, promptCommit, promptText } from "./modals";
import { GithubPagePreviewView, PREVIEW_VIEW_TYPE } from "./preview-view";
import { PreviewServer } from "./preview-server";
import {
  discoverGitRepositories,
  normalizeRepositorySubfolder,
  repositoryPathFromVaultPath,
  repositoryVaultPrefix,
  resolveRepositoryRoot,
} from "./repository-layout";
import { DEFAULT_SETTINGS, GithubPageSettingTab, sanitizeSlug, type GithubPageSettings } from "./settings";
import { installStarterArchive, STARTER_ARCHIVE_URL, vaultHasUserContent } from "./starter-installer";

export default class GithubPagePlugin extends Plugin {
  settings: GithubPageSettings = { ...DEFAULT_SETTINGS };
  private vaultRoot = "";
  private repositoryRoot = "";
  private previewServer = new PreviewServer();
  private coordinator: BuildCoordinator | undefined;
  private git: GitService | undefined;
  private configWatcher: FSWatcher | undefined;
  private statusElement: HTMLElement | undefined;

  async onload(): Promise<void> {
    await this.loadSettings();
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice("GitHubPage requires a desktop filesystem Vault.");
      return;
    }
    this.vaultRoot = adapter.getBasePath();
    try {
      this.repositoryRoot = resolveRepositoryRoot(
        this.vaultRoot,
        this.settings.repositoryMode,
        this.settings.repositorySubfolder,
      );
    } catch (error) {
      this.repositoryRoot = this.vaultRoot;
      this.settings.repositoryMode = "vault";
      this.settings.repositorySubfolder = "";
      new Notice(`Invalid saved repository location; using the Vault root: ${messageFromUnknown(error)}`, 8000);
    }
    await this.previewServer.start();
    this.coordinator = new BuildCoordinator(
      this.vaultRoot,
      () => this.repositoryRoot,
      this.settings,
      this.previewServer,
      (state, result) => this.handleBuildState(state, result?.renderedPages.length ?? 0, result?.reusedPages.length ?? 0),
    );
    this.git = new GitService(
      () => this.repositoryRoot,
      () => this.settings.mainBranch,
      () => this.settings.allowDirectMainPush,
    );
    this.registerView(PREVIEW_VIEW_TYPE, (leaf) => new GithubPagePreviewView(leaf, this.previewServer, this.requireCoordinator()));
    this.addSettingTab(new GithubPageSettingTab(this.app, this));
    this.statusElement = this.addStatusBarItem();
    this.statusElement.setText("GitHubPage: idle");
    this.registerCommands();
    this.registerVaultEvents();
    this.startConfigWatcher();
    this.register(() => this.configWatcher?.close());
    this.register(() => this.coordinator?.dispose());
    this.register(() => void this.previewServer.stop());

    if (await this.isCompatibleVault()) void this.coordinator.buildNow();
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(PREVIEW_VIEW_TYPE);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<GithubPageSettings> | null) };
  }

  private registerVaultEvents(): void {
    const schedule = (file: TAbstractFile) => {
      if (this.shouldRebuildFor(file.path)) this.coordinator?.schedule();
    };
    this.registerEvent(this.app.vault.on("create", schedule));
    this.registerEvent(this.app.vault.on("modify", schedule));
    this.registerEvent(this.app.vault.on("delete", schedule));
    this.registerEvent(this.app.vault.on("rename", (file) => schedule(file)));
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!(file instanceof TFile)) return;
        const route = this.coordinator?.getRouteForVaultPath(file.path) ?? "/";
        this.forEachPreview((view) => view.navigate(route));
      }),
    );
  }

  private registerCommands(): void {
    this.addRibbonIcon("globe-2", "Open GitHubPage preview", () => void this.openPreview());
    this.addRibbonIcon("cloud-upload", "Open GitHubPage publishing", () => void this.openPublishPanel());
    this.addCommand({ id: "open-preview", name: "Open website preview", callback: () => void this.openPreview() });
    this.addCommand({ id: "open-publish-panel", name: "Open publishing panel", callback: () => void this.openPublishPanel() });
    this.addCommand({ id: "publish-updates", name: "Git: Review and publish updates", callback: () => void this.publishUpdates() });
    this.addCommand({ id: "detect-repository", name: "Git: Detect repository inside Vault", callback: () => void this.detectAndConfigureRepository() });
    this.addCommand({
      id: "initialize-starter-vault",
      name: "Initialize Starter Vault from GitHub",
      callback: () => void this.initializeStarterVault(),
    });
    this.addCommand({
      id: "rebuild-preview",
      name: "Rebuild website preview",
      callback: () => void this.requireCompatible(async () => this.requireCoordinator().buildNow()),
    });
    this.addCommand({ id: "git-status", name: "Git: Show status", callback: () => void this.showGitStatus() });
    this.addCommand({
      id: "git-create-collaboration-branch",
      name: "Git: Create collaboration branch",
      callback: () => void this.createCollaborationBranch(),
    });
    this.addCommand({ id: "git-commit-selected", name: "Git: Commit selected changes", callback: () => void this.commitSelected() });
    this.addCommand({ id: "git-pull", name: "Git: Pull current branch (fast-forward only)", callback: () => void this.pullRemote() });
    this.addCommand({ id: "git-push", name: "Git: Push current branch", callback: () => void this.pushRemote() });
    this.addCommand({ id: "git-sync", name: "Git: Sync current branch", callback: () => void this.runGitAction("Synced current branch", () => this.requireGit().syncCurrentBranch()) });
    this.addCommand({ id: "git-update-from-main", name: "Git: Merge latest main into current branch", callback: () => void this.runGitAction("Updated from main", () => this.requireGit().updateFromMain()) });
    this.addCommand({ id: "git-open-pr", name: "Git: Open pull request in GitHub", callback: () => void this.openPullRequest() });
    this.addCommand({ id: "git-abort-operation", name: "Git: Abort merge, rebase, or cherry-pick", callback: () => void this.abortGitOperation() });
  }

  async openPreview(): Promise<void> {
    await this.requireCompatible(async () => {
      if (!this.coordinator?.getResult()) await this.coordinator?.buildNow();
      const existing = this.app.workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)[0];
      let leaf: WorkspaceLeaf;
      if (existing) leaf = existing;
      else {
        leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type: PREVIEW_VIEW_TYPE, active: true });
      }
      await this.app.workspace.revealLeaf(leaf);
      const active = this.app.workspace.getActiveFile();
      if (active) (leaf.view as GithubPagePreviewView).navigate(this.requireCoordinator().getRouteForVaultPath(active.path));
    });
  }

  async initializeStarterVault(): Promise<void> {
    const siteConfigPath = path.join(this.repositoryRoot, ".githubpage", "site.json");
    try {
      await fs.access(siteConfigPath);
      new Notice("This Vault already has a GitHubPage site configuration.");
      return;
    } catch {
      // First-time initialization is allowed when the site configuration is absent.
    }

    try {
      new Notice("Downloading the GitHubPage Starter Vault…");
      const response = await requestUrl({ url: STARTER_ARCHIVE_URL, method: "GET" });
      const compact = await vaultHasUserContent(this.repositoryRoot);
      const fileCount = await installStarterArchive(this.repositoryRoot, response.arrayBuffer, compact ? "compact" : "full");
      this.configWatcher?.close();
      this.configWatcher = undefined;
      this.startConfigWatcher();
      await this.coordinator?.buildNow();
      new Notice(
        compact
          ? `Initialized GitHubPage support files in ${this.getRepositoryDescription()} (${fileCount} files). Existing notes were left untouched.`
          : `Initialized GitHubPage starter site in ${this.getRepositoryDescription()} (${fileCount} files).`,
      );
    } catch (error) {
      new Notice(`GitHubPage initialization failed: ${messageFromUnknown(error)}`, 8000);
      console.error("[GitHubPage] Starter Vault initialization failed", error);
    }
  }

  async showGitStatus(): Promise<void> {
    await this.runGitAction(undefined, async () => {
      const git = this.requireGit();
      await git.checkRepository();
      const [branch, entries] = await Promise.all([git.getCurrentBranch(), git.getStatus()]);
      new GitStatusModal(this.app, branch, entries).open();
    }, false);
  }

  async openPublishPanel(): Promise<void> {
    await this.runGitAction(
      undefined,
      async () => {
        const git = this.requireGit();
        const [branch, entries] = await Promise.all([git.getCurrentBranch(), git.getStatus()]);
        new PublishPanelModal(
          this.app,
          { repository: this.getRepositoryDescription(), branch, changedFiles: entries.length },
          {
            publish: () => this.publishUpdates(),
            showStatus: () => this.showGitStatus(),
            pull: () => this.pullRemote(),
            push: () => this.pushRemote(),
            createBranch: () => this.createCollaborationBranch(),
            openPullRequest: () => this.openPullRequest(),
            rebuildPreview: () => this.rebuildPreview(),
          },
        ).open();
      },
      false,
    );
  }

  async publishUpdates(): Promise<void> {
    await this.runGitAction(
      undefined,
      async () => {
        const git = this.requireGit();
        const branch = await git.getCurrentBranch();
        if (branch === this.settings.mainBranch && !this.settings.allowDirectMainPush) {
          throw new Error(`Direct publishing from ${branch} is disabled. Create a collaboration branch first.`);
        }
        const entries = await git.getStatus();
        if (entries.length > 0) {
          const selection = await promptCommit(this.app, entries);
          if (!selection) return;
          await git.commitSelected(selection.paths, selection.message);
        }
        const remainingChanges = await git.getStatus();
        if (remainingChanges.length === 0) await git.syncCurrentBranch();
        else await git.pushCurrentBranch();
        await this.coordinator?.buildNow();
        if (remainingChanges.length > 0) {
          new Notice(`Published selected updates. ${remainingChanges.length} unselected local change(s) remain; remote pull was skipped safely.`, 7000);
        } else {
          new Notice(entries.length > 0 ? "Committed and published selected updates." : "Local branch is synchronized with the remote.");
        }
      },
      false,
    );
  }

  async pullRemote(): Promise<void> {
    await this.runGitAction("Pulled current branch", () => this.requireGit().pullCurrentBranch());
  }

  async pushRemote(): Promise<void> {
    await this.runGitAction("Pushed current branch", () => this.requireGit().pushCurrentBranch());
  }

  async rebuildPreview(): Promise<void> {
    await this.requireCompatible(async () => this.requireCoordinator().buildNow());
  }

  async detectAndConfigureRepository(): Promise<void> {
    try {
      const repositories = await discoverGitRepositories(this.vaultRoot);
      if (repositories.length === 0) {
        new Notice("No Git repository was found in the Vault root or its first three folder levels.", 7000);
        return;
      }
      const selected = repositories.length === 1 ? repositories[0] : await pickRepository(this.app, repositories);
      if (!selected) return;
      await this.applyRepositorySettings(selected.mode, selected.subfolder);
    } catch (error) {
      new Notice(`Repository detection failed: ${messageFromUnknown(error)}`, 8000);
      console.error("[GitHubPage] Repository detection failed", error);
    }
  }

  async applyRepositorySettings(
    mode = this.settings.repositoryMode,
    rawSubfolder = this.settings.repositorySubfolder,
  ): Promise<void> {
    try {
      const subfolder =
        mode === "subfolder"
          ? normalizeRepositorySubfolder(rawSubfolder)
          : "";
      const nextRoot = resolveRepositoryRoot(this.vaultRoot, mode, subfolder);
      const stat = await fs.stat(nextRoot);
      if (!stat.isDirectory()) throw new Error("The configured repository location is not a folder");
      await new GitService(nextRoot, () => this.settings.mainBranch).checkRepositoryRoot();
      this.settings.repositoryMode = mode;
      this.settings.repositorySubfolder = subfolder;
      this.repositoryRoot = nextRoot;
      await this.saveSettings();
      await this.reconfigureRepository();
      new Notice(`Using Git repository: ${this.getRepositoryDescription()}`);
    } catch (error) {
      new Notice(`Cannot apply repository location: ${messageFromUnknown(error)}`, 8000);
      console.error("[GitHubPage] Invalid repository location", error);
    }
  }

  getRepositoryDescription(): string {
    try {
      return repositoryVaultPrefix(this.vaultRoot, this.repositoryRoot) || "Vault root";
    } catch {
      return "Vault root";
    }
  }

  async createCollaborationBranch(): Promise<void> {
    let author = sanitizeSlug(this.settings.authorSlug);
    if (!author) {
      const input = await promptText(this.app, "Author branch name", "alice");
      if (!input) return;
      author = sanitizeSlug(input);
      this.settings.authorSlug = author;
      await this.saveSettings();
    }
    const taskInput = await promptText(this.app, "Task branch name", "update-home-page");
    if (!taskInput) return;
    const task = sanitizeSlug(taskInput);
    if (!task) return;
    await this.runGitAction(undefined, async () => {
      const branch = await this.requireGit().createCollaborationBranch(author, task);
      new Notice(`Created ${branch}`);
    });
  }

  private async commitSelected(): Promise<void> {
    await this.runGitAction(undefined, async () => {
      const entries = await this.requireGit().getStatus();
      if (entries.length === 0) {
        new Notice("Working tree clean.");
        return;
      }
      const selection = await promptCommit(this.app, entries);
      if (!selection) return;
      await this.requireGit().commitSelected(selection.paths, selection.message);
      new Notice("Committed selected changes.");
    });
  }

  async openPullRequest(): Promise<void> {
    await this.runGitAction(undefined, async () => {
      const url = await this.requireGit().getPullRequestUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    }, false);
  }

  private async abortGitOperation(): Promise<void> {
    await this.runGitAction(undefined, async () => {
      const aborted = await this.requireGit().abortInProgressOperation();
      new Notice(aborted ? "Git operation aborted safely." : "No merge, rebase, or cherry-pick is in progress.");
    });
  }

  private async runGitAction(successMessage: string | undefined, action: () => Promise<void>, rebuild = true): Promise<void> {
    try {
      await this.requireGit().checkRepository();
      await action();
      if (rebuild) await this.coordinator?.buildNow();
      if (successMessage) new Notice(successMessage);
    } catch (error) {
      const conflicts = await this.git?.getConflictedPaths().catch(() => []);
      if (conflicts && conflicts.length > 0) {
        new ConflictModal(this.app, conflicts, repositoryVaultPrefix(this.vaultRoot, this.repositoryRoot)).open();
      }
      new Notice(`GitHubPage Git: ${messageFromUnknown(error)}`, 8000);
      console.error("[GitHubPage] Git operation failed", error);
    }
  }

  private async requireCompatible(action: () => Promise<void>): Promise<void> {
    if (!(await this.isCompatibleVault())) {
      new Notice("The active repository has no .githubpage/site.json. Initialize it or choose another repository.", 7000);
      return;
    }
    await action();
  }

  private async isCompatibleVault(): Promise<boolean> {
    try {
      await fs.access(path.join(this.repositoryRoot, ".githubpage", "site.json"));
      return true;
    } catch {
      return false;
    }
  }

  private startConfigWatcher(): void {
    const directory = path.join(this.repositoryRoot, ".githubpage");
    try {
      this.configWatcher = watch(directory, { recursive: true }, () => this.coordinator?.schedule());
      this.configWatcher.on("error", (error) => console.warn("[GitHubPage] Theme watcher stopped", error));
    } catch {
      this.configWatcher = undefined;
    }
  }

  private shouldRebuildFor(vaultPath: string): boolean {
    const repositoryPath = repositoryPathFromVaultPath(this.vaultRoot, this.repositoryRoot, vaultPath);
    if (repositoryPath === undefined) return false;
    const normalized = repositoryPath.replaceAll("\\", "/");
    if (normalized.startsWith(".obsidian/") || normalized.startsWith(".git/") || normalized.startsWith("_site/")) return false;
    const extension = path.posix.extname(normalized).toLocaleLowerCase("en");
    const assets = this.coordinator?.getConfig()?.content.assetExtensions ?? [];
    return extension === ".md" || assets.includes(extension);
  }

  private handleBuildState(state: BuildState, rendered: number, reused: number): void {
    const detail = state === "ready" ? ` · ${rendered} rendered, ${reused} reused` : "";
    this.statusElement?.setText(`GitHubPage: ${state}${detail}`);
    this.forEachPreview((view) => view.updateBuildState(state));
  }

  private async reconfigureRepository(): Promise<void> {
    this.coordinator?.reset();
    this.configWatcher?.close();
    this.configWatcher = undefined;
    this.startConfigWatcher();
    if (await this.isCompatibleVault()) await this.coordinator?.buildNow();
  }

  private forEachPreview(action: (view: GithubPagePreviewView) => void): void {
    for (const leaf of this.app.workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)) {
      if (leaf.view instanceof GithubPagePreviewView) action(leaf.view);
    }
  }

  private requireCoordinator(): BuildCoordinator {
    if (!this.coordinator) throw new Error("GitHubPage build coordinator is unavailable");
    return this.coordinator;
  }

  private requireGit(): GitService {
    if (!this.git) throw new Error("GitHubPage Git service is unavailable");
    return this.git;
  }
}
