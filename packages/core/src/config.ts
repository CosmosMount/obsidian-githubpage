import { z } from "zod";
import { ENGINE_VERSION, type SiteConfig, type ThemeManifest } from "./types";
import { GithubPageError } from "./errors";
import { isSafeRelativePath } from "./paths";

const relativePath = z.string().min(1).refine(isSafeRelativePath, {
  message: "must be a safe relative path without '..' segments",
});

const siteConfigSchema = z.object({
  schemaVersion: z.literal(1),
  engineVersion: z.string().min(1),
  site: z.object({
    title: z.string().min(1),
    baseUrl: z.url().refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
      message: "must use http or https",
    }),
    language: z.string().min(2).default("en"),
  }),
  content: z.object({
    root: z.string().refine((value) => value === "." || isSafeRelativePath(value), {
      message: "must be '.' or a safe relative path",
    }).default("."),
    exclude: z.array(z.string()).default([]),
    assetExtensions: z
      .array(z.string().regex(/^\.[a-z0-9]+$/i))
      .default([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".mp3", ".mp4", ".webm"]),
  }),
  theme: z.object({
    path: relativePath.default(".githubpage/theme"),
  }),
});

const themeManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  layout: z.object({
    template: relativePath.default("layout.html"),
  }),
  components: z.object({
    navigation: z.boolean().default(true),
    breadcrumbs: z.boolean().default(true),
    tableOfContents: z.boolean().default(true),
    search: z.boolean().default(true),
    darkMode: z.boolean().default(true),
  }),
  tokens: z.record(z.string(), z.string()).default({}),
});

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new GithubPageError("INVALID_JSON", `${label} is not valid JSON`, error);
  }
}

export function parseSiteConfig(raw: string): SiteConfig {
  const result = siteConfigSchema.safeParse(parseJson(raw, "site.json"));
  if (!result.success) {
    throw new GithubPageError("INVALID_SITE_CONFIG", z.prettifyError(result.error));
  }
  if (result.data.engineVersion !== ENGINE_VERSION) {
    throw new GithubPageError(
      "ENGINE_VERSION_MISMATCH",
      `site.json requires engine ${result.data.engineVersion}, but this build uses ${ENGINE_VERSION}`,
    );
  }
  return result.data as SiteConfig;
}

export function parseThemeManifest(raw: string): ThemeManifest {
  const result = themeManifestSchema.safeParse(parseJson(raw, "theme.json"));
  if (!result.success) {
    throw new GithubPageError("INVALID_THEME_MANIFEST", z.prettifyError(result.error));
  }
  return result.data as ThemeManifest;
}
