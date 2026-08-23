import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { BuildCoordinator, BuildState } from "./build-coordinator";
import type { PreviewServer } from "./preview-server";

export const PREVIEW_VIEW_TYPE = "githubpage-preview";

export class GithubPagePreviewView extends ItemView {
  private frame?: HTMLIFrameElement;
  private status?: HTMLElement;
  private route = "/";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly server: PreviewServer,
    private readonly coordinator: BuildCoordinator,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return PREVIEW_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "GitHubPage preview";
  }

  getIcon(): string {
    return "globe-2";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("githubpage-preview-view");
    const toolbar = this.contentEl.createDiv({ cls: "githubpage-preview-toolbar" });
    this.status = toolbar.createSpan({ text: "Waiting for build…" });
    const reload = toolbar.createEl("button", { text: "Reload", attr: { type: "button" } });
    reload.addEventListener("click", () => this.reload());
    this.frame = this.contentEl.createEl("iframe", {
      cls: "githubpage-preview-frame",
      attr: {
        title: "GitHubPage website preview",
        sandbox: "allow-scripts allow-same-origin",
        referrerpolicy: "no-referrer",
      },
    });
    if (this.coordinator.getResult()) this.reload();
  }

  navigate(route: string): void {
    this.route = route;
    this.reload();
  }

  updateBuildState(state: BuildState): void {
    if (this.status) this.status.setText(state === "ready" ? "Up to date" : state === "building" ? "Building…" : state === "error" ? "Build has errors" : "Idle");
    if (state === "ready" || (state === "error" && this.coordinator.getResult())) this.reload();
  }

  reload(): void {
    if (!this.frame || !this.coordinator.getResult()) return;
    this.frame.src = this.server.getSessionUrl(this.route);
  }
}
