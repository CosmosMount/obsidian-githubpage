import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "main.js", "packages/*/dist/**", "examples/starter-vault/_site/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    },
  },
);
