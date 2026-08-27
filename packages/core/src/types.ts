export const ENGINE_VERSION = "1.1.0";

export interface SiteConfig {
  schemaVersion: 1;
  engineVersion: string;
  site: {
    title: string;
    baseUrl: string;
    language: string;
  };
  content: {
    root: string;
    exclude: string[];
    assetExtensions: string[];
  };
  theme: {
    path: string;
  };
}

export interface ThemeManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  layout: {
    template: string;
  };
  components: {
    navigation: boolean;
    breadcrumbs: boolean;
    tableOfContents: boolean;
    search: boolean;
    darkMode: boolean;
  };
  tokens: Record<string, string>;
}

export interface SourceFile {
  path: string;
  content: string | Uint8Array;
  mediaType?: string;
}

export interface LoadedTheme {
  manifest: ThemeManifest;
  template: string;
  css: string;
  assets: SourceFile[];
}

export interface ProjectInput {
  config: SiteConfig;
  theme: LoadedTheme;
  files: SourceFile[];
}

export type DiagnosticSeverity = "error" | "warning";

export interface BuildDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
}

export interface OutputFile {
  path: string;
  content: string | Uint8Array;
  mediaType: string;
}

export interface CachedPage {
  sourceFingerprint: string;
  output: OutputFile;
  diagnostics: BuildDiagnostic[];
}

export interface BuildCache {
  globalFingerprint: string;
  pages: Record<string, CachedPage>;
}

export interface BuildResult {
  outputs: Map<string, OutputFile>;
  diagnostics: BuildDiagnostic[];
  cache: BuildCache;
  renderedPages: string[];
  reusedPages: string[];
}

export interface PageRecord {
  sourcePath: string;
  route: string;
  outputPath: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  plainText: string;
}

export interface HeadingRecord {
  level: number;
  text: string;
  slug: string;
}
