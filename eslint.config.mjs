import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig(
  {
    ignores: ["node_modules/**", "main.js", "packages/*/dist/**", "examples/starter-vault/_site/**"],
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs"],
        },
      },
    },
  },
  {
    files: ["packages/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          acronyms: ["API", "CLI", "CSS", "HTML", "JSON", "PR", "URL"],
          brands: ["GitHub", "GitHubPage"],
        },
      ],
    },
  },
  {
    // The CLI bundles workspace source into one standalone artifact, and tests
    // resolve workspace packages through Vitest aliases rather than npm runtime dependencies.
    files: ["packages/cli/src/**/*.ts", "tests/**/*.ts"],
    rules: {
      "import/no-extraneous-dependencies": "off",
    },
  },
);
