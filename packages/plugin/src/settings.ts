import { PluginSettingTab, Setting, type App } from "obsidian";
import type GithubPagePlugin from "./main";
import type { RepositoryMode } from "./repository-layout";

export interface GithubPageSettings {
  repositoryMode: RepositoryMode;
  repositorySubfolder: string;
  authorSlug: string;
  mainBranch: string;
  allowDirectMainPush: boolean;
  rebuildDelayMs: number;
}

export const DEFAULT_SETTINGS: GithubPageSettings = {
  repositoryMode: "vault",
  repositorySubfolder: "",
  authorSlug: "",
  mainBranch: "main",
  allowDirectMainPush: false,
  rebuildDelayMs: 350,
};

export class GithubPageSettingTab extends PluginSettingTab {
  private repositoryMode: RepositoryMode;
  private repositorySubfolder: string;

  constructor(app: App, private readonly plugin: GithubPagePlugin) {
    super(app, plugin);
    this.repositoryMode = plugin.settings.repositoryMode;
    this.repositorySubfolder = plugin.settings.repositorySubfolder;
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName("Repository").setHeading();

    new Setting(this.containerEl)
      .setName("Repository location")
      .setDesc("Choose whether the GitHub repository is the whole vault or a folder inside it.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("vault", "Current vault")
          .addOption("subfolder", "Folder inside current vault")
          .setValue(this.repositoryMode)
          .onChange((value) => {
            this.repositoryMode = value as RepositoryMode;
            if (value === "vault") this.repositorySubfolder = "";
            this.display();
          }),
      );

    if (this.repositoryMode === "subfolder") {
      new Setting(this.containerEl)
        .setName("Repository folder")
        .setDesc("Vault-relative folder containing .git and .githubpage, for example Sites/MyNotes.")
        .addText((text) =>
          text
            .setPlaceholder("Sites/MyNotes")
            .setValue(this.repositorySubfolder)
            .onChange((value) => {
              this.repositorySubfolder = value;
            }),
        );
    }

    new Setting(this.containerEl)
      .setName("Active repository")
      .setDesc(this.plugin.getRepositoryDescription())
      .addButton((button) =>
        button.setButtonText("Detect repositories").onClick(async () => {
          await this.plugin.detectAndConfigureRepository();
          this.repositoryMode = this.plugin.settings.repositoryMode;
          this.repositorySubfolder = this.plugin.settings.repositorySubfolder;
          this.display();
        }),
      )
      .addButton((button) =>
        button.setCta().setButtonText("Apply location").onClick(async () => {
          await this.plugin.applyRepositorySettings(this.repositoryMode, this.repositorySubfolder);
          this.repositoryMode = this.plugin.settings.repositoryMode;
          this.repositorySubfolder = this.plugin.settings.repositorySubfolder;
          this.display();
        }),
      );

    new Setting(this.containerEl).setName("Publishing").setHeading();

    new Setting(this.containerEl)
      .setName("Publish updates")
      .setDesc("Review changed files, enter a commit message, receive remote updates, and push with one guided action.")
      .addButton((button) =>
        button.setCta().setButtonText("Open publish panel").onClick(() => void this.plugin.openPublishPanel()),
      )
      .addButton((button) => button.setButtonText("Show status").onClick(() => void this.plugin.showGitStatus()));

    new Setting(this.containerEl)
      .setName("Remote actions")
      .setDesc("Use these separately when you only want to receive or send already committed changes.")
      .addButton((button) => button.setButtonText("Pull").onClick(() => void this.plugin.pullRemote()))
      .addButton((button) => button.setButtonText("Push").onClick(() => void this.plugin.pushRemote()));

    new Setting(this.containerEl)
      .setName("Collaboration")
      .setDesc("Create an author branch before publishing, then open its GitHub pull request after pushing.")
      .addButton((button) => button.setButtonText("Create branch").onClick(() => void this.plugin.createCollaborationBranch()))
      .addButton((button) => button.setButtonText("Open pull request").onClick(() => void this.plugin.openPullRequest()));

    new Setting(this.containerEl)
      .setName("Local preview")
      .setDesc("Rebuild or open the website preview. These actions do not publish to GitHub.")
      .addButton((button) => button.setButtonText("Rebuild").onClick(() => void this.plugin.rebuildPreview()))
      .addButton((button) => button.setButtonText("Open preview").onClick(() => void this.plugin.openPreview()));

    new Setting(this.containerEl).setName("Git behavior").setHeading();

    new Setting(this.containerEl)
      .setName("Author branch name")
      .setDesc("Used in author/<name>/<task> collaboration branches. Letters, numbers, dash and underscore only.")
      .addText((text) =>
        text
          .setPlaceholder("Alice")
          .setValue(this.plugin.settings.authorSlug)
          .onChange(async (value) => {
            this.plugin.settings.authorSlug = sanitizeSlug(value);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("Main branch")
      .setDesc(
        this.plugin.settings.allowDirectMainPush
          ? "Publishing branch. Direct commits and pushes are enabled below."
          : "Protected publishing branch. The plugin refuses to commit directly to it.",
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.mainBranch).onChange(async (value) => {
          this.plugin.settings.mainBranch = value.trim() || "main";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(this.containerEl)
      .setName("Allow direct main-branch push")
      .setDesc("Risky: commits and pushes from the current main branch are allowed. Force-push is never used.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.allowDirectMainPush).onChange(async (value) => {
          this.plugin.settings.allowDirectMainPush = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(this.containerEl)
      .setName("Preview rebuild delay")
      .setDesc("Debounce delay after a file change, in milliseconds.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.rebuildDelayMs)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 5000) {
            this.plugin.settings.rebuildDelayMs = parsed;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(this.containerEl).setName("Site initialization").setHeading();

    new Setting(this.containerEl)
      .setName("Starter site files")
      .setDesc("Installs into the active repository. Empty repositories receive the full example; existing content receives only hidden site files and the pages workflow. Existing files are never overwritten.")
      .addButton((button) =>
        button.setButtonText("Download and initialize").onClick(() => void this.plugin.initializeStarterVault()),
      );
  }
}

export function sanitizeSlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
