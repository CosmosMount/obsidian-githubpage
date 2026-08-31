import { parseDocument } from "yaml";

export interface ParsedFrontmatter {
  content: string;
  data: Record<string, unknown>;
}

const OPENING_DELIMITER = /^---[ \t]*(?:\r?\n|$)/;
const CLOSING_DELIMITER = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m;

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const normalizedSource = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const opening = OPENING_DELIMITER.exec(normalizedSource);
  if (!opening) return { content: normalizedSource, data: {} };

  const remainder = normalizedSource.slice(opening[0].length);
  const closing = CLOSING_DELIMITER.exec(remainder);
  if (!closing) throw new Error("Invalid YAML frontmatter: missing closing delimiter");

  const yamlSource = remainder.slice(0, closing.index);
  const content = remainder.slice(closing.index + closing[0].length);
  if (!yamlSource.trim()) return { content, data: {} };

  const document = parseDocument(yamlSource, {
    logLevel: "error",
    prettyErrors: true,
    schema: "core",
    strict: true,
    stringKeys: true,
    uniqueKeys: true,
  });
  const issues = [...document.errors, ...document.warnings];
  if (issues.length > 0) {
    throw new Error(`Invalid YAML frontmatter: ${issues.map((issue) => issue.message).join("; ")}`);
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 100 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid YAML frontmatter: ${message}`);
  }
  if (value === null) return { content, data: {} };
  if (!isRecord(value)) throw new Error("Invalid YAML frontmatter: the top level must be a mapping");
  assertNoCircularReferences(value);
  return { content, data: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNoCircularReferences(value: unknown, ancestors = new WeakSet<object>()): void {
  if (typeof value !== "object" || value === null) return;
  if (ancestors.has(value)) {
    throw new Error("Invalid YAML frontmatter: circular aliases are not supported");
  }

  ancestors.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    assertNoCircularReferences(child, ancestors);
  }
  ancestors.delete(value);
}
