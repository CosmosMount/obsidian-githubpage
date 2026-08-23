import { build, context } from "esbuild";
import process from "node:process";

const watch = process.argv.includes("--watch");

const common = {
  bundle: true,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  target: "es2022",
  platform: "node",
  format: "cjs",
  loader: { ".css": "text" },
};

const builds = [
  {
    ...common,
    entryPoints: ["packages/plugin/src/main.ts"],
    outfile: "main.js",
    external: ["obsidian", "electron"],
  },
  {
    ...common,
    entryPoints: ["packages/cli/src/index.ts"],
    outfile: "packages/cli/dist/index.cjs",
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    ...common,
    entryPoints: ["packages/core/src/index.ts"],
    outfile: "packages/core/dist/index.cjs",
  },
  {
    ...common,
    entryPoints: ["packages/node-adapter/src/index.ts"],
    outfile: "packages/node-adapter/dist/index.cjs",
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((options) => context(options)));
  await Promise.all(contexts.map((item) => item.watch()));
  console.log("Watching Obsidian GitHubPage packages...");
} else {
  await Promise.all(builds.map((options) => build(options)));
}
