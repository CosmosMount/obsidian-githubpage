import { Modal, Setting, type App } from "obsidian";
import type { GitStatusEntry } from "./git-service";
import type { DetectedRepository } from "./repository-layout";

export interface PublishPanelSnapshot {
  repository: string;
  branch: string;
  changedFiles: number;
}

export interface PublishPanelActions {
  publish: () => void | Promise<void>;
  showStatus: () => void | Promise<void>;
  pull: () => void | Promise<void>;
  push: () => void | Promise<void>;
  createBranch: () => void | Promise<void>;
  openPullRequest: () => void | Promise<void>;
  rebuildPreview: () => void | Promise<void>;
}

export class TextPromptModal extends Modal {
  private settled = false;
  private value = "";

  constructor(
    app: App,
    private readonly titleText: string,
    private readonly placeholder: string,
    private readonly resolveValue: (value: string | undefined) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.titleText);
    new Setting(this.contentEl).addText((text) => {
      text.setPlaceholder(this.placeholder).onChange((value) => {
        this.value = value;
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.submit();
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(this.contentEl).addButton((button) => button.setCta().setButtonText("Continue").onClick(() => this.submit()));
  }

  onClose(): void {
    if (!this.settled) this.resolveValue(undefined);
    this.contentEl.empty();
  }

  private submit(): void {
    const value = this.value.trim();
    if (!value) return;
    this.settled = true;
    this.resolveValue(value);
    this.close();
  }
}

export class GitCommitModal extends Modal {
  private readonly selected = new Set<string>();
  private message = "";
  private settled = false;

  constructor(
    app: App,
    private readonly entries: GitStatusEntry[],
    private readonly resolveValue: (value: { paths: string[]; message: string } | undefined) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Commit selected changes");
    this.contentEl.createEl("p", { text: "Only checked files will be staged. Existing staged changes remain part of the commit." });
    const list = this.contentEl.createDiv({ cls: "githubpage-change-list" });
    for (const entry of this.entries) {
      this.selected.add(entry.path);
      new Setting(list)
        .setName(entry.path)
        .setDesc(`${entry.indexStatus}${entry.workTreeStatus}${entry.originalPath ? ` from ${entry.originalPath}` : ""}`)
        .addToggle((toggle) =>
          toggle.setValue(true).onChange((checked) => {
            if (checked) this.selected.add(entry.path);
            else this.selected.delete(entry.path);
          }),
        );
    }
    new Setting(this.contentEl)
      .setName("Commit message")
      .addText((text) =>
        text.setPlaceholder("Describe this change").onChange((value) => {
          this.message = value;
        }),
      );
    new Setting(this.contentEl).addButton((button) => button.setCta().setButtonText("Commit").onClick(() => this.submit()));
  }

  onClose(): void {
    if (!this.settled) this.resolveValue(undefined);
    this.contentEl.empty();
  }

  private submit(): void {
    if (!this.message.trim() || this.selected.size === 0) return;
    this.settled = true;
    this.resolveValue({ paths: [...this.selected], message: this.message.trim() });
    this.close();
  }
}

export class GitStatusModal extends Modal {
  constructor(
    app: App,
    private readonly branch: string,
    private readonly entries: GitStatusEntry[],
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(`Git status · ${this.branch}`);
    if (this.entries.length === 0) {
      this.contentEl.createEl("p", { text: "Working tree clean." });
      return;
    }
    const list = this.contentEl.createEl("ul", { cls: "githubpage-status-list" });
    for (const entry of this.entries) {
      list.createEl("li", { text: `${entry.indexStatus}${entry.workTreeStatus} ${entry.path}` });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class RepositoryPickerModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly repositories: DetectedRepository[],
    private readonly resolveValue: (value: DetectedRepository | undefined) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Choose a Git repository");
    this.contentEl.createEl("p", { text: "GitHubPage found these repository roots inside the current Vault." });
    for (const repository of this.repositories) {
      new Setting(this.contentEl)
        .setName(repository.label)
        .setDesc(repository.mode === "vault" ? "Use the entire Vault" : "Use only this folder and its contents")
        .addButton((button) =>
          button.setButtonText("Use repository").onClick(() => {
            this.settled = true;
            this.resolveValue(repository);
            this.close();
          }),
        );
    }
  }

  onClose(): void {
    if (!this.settled) this.resolveValue(undefined);
    this.contentEl.empty();
  }
}

export class PublishPanelModal extends Modal {
  constructor(
    app: App,
    private readonly snapshot: PublishPanelSnapshot,
    private readonly actions: PublishPanelActions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("GitHubPage publishing");
    const summary = this.contentEl.createDiv({ cls: "githubpage-publish-summary" });
    summary.createEl("div", { text: `Repository: ${this.snapshot.repository}` });
    summary.createEl("div", { text: `Branch: ${this.snapshot.branch}` });
    summary.createEl("div", {
      text: this.snapshot.changedFiles === 0 ? "Local changes: none" : `Local changes: ${this.snapshot.changedFiles} file(s)`,
    });

    this.addAction(
      "Publish updates",
      "Review changed files and commit them, then fast-forward from the remote when the working tree is clean and push the current branch.",
      "Review and publish",
      this.actions.publish,
      true,
    );
    this.addAction("Changed files", "Inspect the current branch and working tree without changing anything.", "Show status", this.actions.showStatus);
    this.addAction("Receive remote updates", "Fast-forward the current branch. Local uncommitted changes are never overwritten.", "Pull", this.actions.pull);
    this.addAction("Send committed updates", "Push commits already present on the current branch.", "Push", this.actions.push);
    this.addAction("Collaboration branch", "Create an author branch. Uncommitted main-branch changes move to the new branch safely.", "Create branch", this.actions.createBranch);
    this.addAction("Pull request", "Open GitHub's compare page for the current non-main branch.", "Open pull request", this.actions.openPullRequest);
    this.addAction("Website preview", "Rebuild the local website without committing or publishing anything.", "Rebuild", this.actions.rebuildPreview);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private addAction(
    name: string,
    description: string,
    buttonText: string,
    action: () => void | Promise<void>,
    cta = false,
  ): void {
    new Setting(this.contentEl).setName(name).setDesc(description).addButton((button) => {
      if (cta) button.setCta();
      button.setButtonText(buttonText).onClick(() => {
        this.close();
        void action();
      });
    });
  }
}

export class ConflictModal extends Modal {
  constructor(
    app: App,
    private readonly paths: string[],
    private readonly vaultPrefix = "",
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Git conflicts need attention");
    this.contentEl.createEl("p", { text: "Git stopped without overwriting either side. Open each file, resolve conflict markers, then commit." });
    for (const filePath of this.paths) {
      new Setting(this.contentEl).setName(filePath).addButton((button) =>
        button.setButtonText("Open").onClick(async () => {
          const vaultPath = this.vaultPrefix ? `${this.vaultPrefix}/${filePath}` : filePath;
          await this.app.workspace.openLinkText(vaultPath, "", true);
        }),
      );
    }
  }
}

export function promptText(app: App, title: string, placeholder: string): Promise<string | undefined> {
  return new Promise((resolve) => new TextPromptModal(app, title, placeholder, resolve).open());
}

export function promptCommit(
  app: App,
  entries: GitStatusEntry[],
): Promise<{ paths: string[]; message: string } | undefined> {
  return new Promise((resolve) => new GitCommitModal(app, entries, resolve).open());
}

export function pickRepository(app: App, repositories: DetectedRepository[]): Promise<DetectedRepository | undefined> {
  return new Promise((resolve) => new RepositoryPickerModal(app, repositories, resolve).open());
}
