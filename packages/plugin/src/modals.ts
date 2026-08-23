import { Modal, Setting, type App } from "obsidian";
import type { GitStatusEntry } from "./git-service";

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

export class ConflictModal extends Modal {
  constructor(
    app: App,
    private readonly paths: string[],
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Git conflicts need attention");
    this.contentEl.createEl("p", { text: "Git stopped without overwriting either side. Open each file, resolve conflict markers, then commit." });
    for (const filePath of this.paths) {
      new Setting(this.contentEl).setName(filePath).addButton((button) =>
        button.setButtonText("Open").onClick(async () => {
          await this.app.workspace.openLinkText(filePath, "", true);
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
