import path from "node:path";
import process from "node:process";
import {
  buildProject,
  diagnosticsHaveErrors,
  formatDiagnostics,
  loadProject,
  writeBuildResult,
} from "@obsidian-githubpage/node-adapter";
import { ENGINE_VERSION, messageFromUnknown, validateTheme } from "@obsidian-githubpage/core";

interface CliOptions {
  command: "build" | "validate" | "version" | "help";
  root: string;
  output: string;
  json: boolean;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "help") {
    printUsage();
    return;
  }
  if (options.command === "version") {
    writeStdout(ENGINE_VERSION);
    return;
  }
  const root = path.resolve(options.root);
  if (options.command === "validate") {
    const project = await loadProject(root);
    validateTheme(project.theme);
    const result = await buildProject(root);
    report(result.diagnostics, options.json);
    if (diagnosticsHaveErrors(result.diagnostics)) process.exitCode = 1;
    return;
  }
  const result = await buildProject(root);
  report(result.diagnostics, options.json);
  if (diagnosticsHaveErrors(result.diagnostics)) {
    process.exitCode = 1;
    return;
  }
  const output = await writeBuildResult(root, options.output, result);
  if (!options.json) {
    writeStdout(`Built ${result.renderedPages.length + result.reusedPages.length} pages to ${output}`);
  }
}

function parseArguments(argumentsList: string[]): CliOptions {
  const commandValue = argumentsList[0] ?? "help";
  if (!["build", "validate", "version", "--version", "help", "--help", "-h"].includes(commandValue)) {
    throw new Error(`Unknown command: ${commandValue}`);
  }
  const command = commandValue === "--version" ? "version" : ["--help", "-h"].includes(commandValue) ? "help" : commandValue;
  let root = ".";
  let output = "_site";
  let json = false;
  for (let index = 1; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--root") root = requireValue(argumentsList, ++index, "--root");
    else if (argument === "--output") output = requireValue(argumentsList, ++index, "--output");
    else if (argument === "--json") json = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return { command: command as CliOptions["command"], root, output, json };
}

function requireValue(argumentsList: string[], index: number, option: string): string {
  const value = argumentsList[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function report(diagnostics: Awaited<ReturnType<typeof buildProject>>["diagnostics"], json: boolean): void {
  if (json) writeStdout(JSON.stringify(diagnostics));
  else if (diagnostics.length > 0) writeStderr(formatDiagnostics(diagnostics));
}

function printUsage(): void {
  writeStdout(`Obsidian GitHubPage ${ENGINE_VERSION}

Usage:
  obsidian-githubpage build [--root <vault>] [--output <directory>] [--json]
  obsidian-githubpage validate [--root <vault>] [--json]
  obsidian-githubpage version`);
}

function writeStdout(value: string): void {
  process.stdout.write(value + "\n");
}

function writeStderr(value: string): void {
  process.stderr.write(value + "\n");
}

main().catch((error: unknown) => {
  writeStderr(`ERROR ${messageFromUnknown(error)}`);
  process.exitCode = 1;
});
