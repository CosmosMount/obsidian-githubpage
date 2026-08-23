import { PluginSettingTab, Setting, type App } from "obsidian";
import type GithubPagePlugin from "./main";

export interface GithubPageSettings {
  authorSlug: string;
  mainBranch: string;
  rebuildDelayMs: number;
}

export const DEFAULT_SETTINGS: GithubPageSettings = {
  authorSlug: "",
  mainBranch: "main",
  rebuildDelayMs: 350,
};

export class GithubPageSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: GithubPagePlugin) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "GitHubPage" });

    new Setting(this.containerEl)
      .setName("Author branch name")
      .setDesc("Used in author/<name>/<task> collaboration branches. Letters, numbers, dash and underscore only.")
      .addText((text) =>
        text
          .setPlaceholder("alice")
          .setValue(this.plugin.settings.authorSlug)
          .onChange(async (value) => {
            this.plugin.settings.authorSlug = sanitizeSlug(value);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("Main branch")
      .setDesc("Protected publishing branch. The plugin refuses to commit directly to it.")
      .addText((text) =>
        text.setValue(this.plugin.settings.mainBranch).onChange(async (value) => {
          this.plugin.settings.mainBranch = value.trim() || "main";
          await this.plugin.saveSettings();
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
