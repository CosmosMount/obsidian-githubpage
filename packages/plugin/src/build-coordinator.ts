import { buildSite, messageFromUnknown, sourcePathToRoute, type BuildCache, type BuildResult, type SiteConfig } from "@obsidian-githubpage/core";
import { formatDiagnostics, loadProject } from "@obsidian-githubpage/node-adapter";
import { Notice, normalizePath } from "obsidian";
import { repositoryPathFromVaultPath } from "./repository-layout";
import type { GithubPageSettings } from "./settings";
import type { PreviewServer } from "./preview-server";

export type BuildState = "idle" | "building" | "ready" | "error";

export class BuildCoordinator {
  private cache: BuildCache | undefined;
  private result: BuildResult | undefined;
  private config: SiteConfig | undefined;
  private timer: number | undefined;
  private building: Promise<void> | undefined;
  private queued = false;
  private state: BuildState = "idle";

  constructor(
    private readonly vaultRoot: string,
    private readonly repositoryRoot: () => string,
    private readonly settings: GithubPageSettings,
    private readonly previewServer: PreviewServer,
    private readonly onStateChange: (state: BuildState, result?: BuildResult) => void,
  ) {}

  schedule(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      void this.buildNow();
    }, this.settings.rebuildDelayMs);
  }

  async buildNow(): Promise<void> {
    if (this.building) {
      this.queued = true;
      return this.building;
    }
    this.building = this.performBuild();
    try {
      await this.building;
    } finally {
      this.building = undefined;
      if (this.queued) {
        this.queued = false;
        void this.buildNow();
      }
    }
  }

  dispose(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  reset(): void {
    this.cache = undefined;
    this.result = undefined;
    this.config = undefined;
  }

  getRouteForVaultPath(vaultPath: string): string {
    const contentRoot = this.config?.content.root ?? ".";
    const repositoryPath = repositoryPathFromVaultPath(this.vaultRoot, this.repositoryRoot(), vaultPath);
    if (repositoryPath === undefined) return "/";
    let relative = normalizePath(repositoryPath);
    if (contentRoot !== ".") {
      const prefix = `${normalizePath(contentRoot).replace(/\/$/, "")}/`;
      if (!relative.startsWith(prefix)) return "/";
      relative = relative.slice(prefix.length);
    }
    return relative.toLocaleLowerCase("en").endsWith(".md") ? sourcePathToRoute(relative) : "/";
  }

  getConfig(): SiteConfig | undefined {
    return this.config;
  }

  getResult(): BuildResult | undefined {
    return this.result;
  }

  private async performBuild(): Promise<void> {
    this.setState("building");
    try {
      // The plugin can transparently migrate a schema-compatible Vault after
      // an engine update. The standalone CLI remains strict for CI parity.
      const project = await loadProject(this.repositoryRoot(), { migrateEngineVersion: true });
      const result = buildSite(project, this.cache);
      this.cache = result.cache;
      this.result = result;
      this.config = project.config;
      this.previewServer.setBuild(result, project.config.site.baseUrl);
      this.setState(result.diagnostics.some((item) => item.severity === "error") ? "error" : "ready", result);
      if (result.diagnostics.length > 0) {
        console.warn(`[GitHubPage]\n${formatDiagnostics(result.diagnostics)}`);
      }
    } catch (error) {
      this.setState("error");
      console.error("[GitHubPage] Build failed", error);
      new Notice(`GitHubPage build failed: ${messageFromUnknown(error)}`, 8000);
    }
  }

  private setState(state: BuildState, result?: BuildResult): void {
    this.state = state;
    this.onStateChange(state, result);
  }
}
