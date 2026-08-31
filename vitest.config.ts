import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@obsidian-githubpage/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@obsidian-githubpage/node-adapter": fileURLToPath(new URL("./packages/node-adapter/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
