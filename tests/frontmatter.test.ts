import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "@obsidian-githubpage/core";

describe("YAML frontmatter", () => {
  it("preserves content without frontmatter while removing a UTF-8 BOM", () => {
    expect(parseFrontmatter("\uFEFF# Heading\n\n---\n\nBody")).toEqual({
      content: "# Heading\n\n---\n\nBody",
      data: {},
    });
  });

  it("parses CRLF, arrays and nested mappings without consuming body delimiters", () => {
    const parsed = parseFrontmatter(
      [
        "\uFEFF---",
        "title: Home",
        "tags:",
        "  - notes",
        "  - public",
        "options:",
        "  enabled: true",
        "---",
        "# Body",
        "---",
        "Still body",
      ].join("\r\n"),
    );

    expect(parsed.data).toEqual({
      title: "Home",
      tags: ["notes", "public"],
      options: { enabled: true },
    });
    expect(parsed.content).toBe("# Body\r\n---\r\nStill body");
  });

  it("accepts empty frontmatter", () => {
    expect(parseFrontmatter("---\n---\nBody")).toEqual({ content: "Body", data: {} });
  });

  it("rejects malformed, duplicate-key and non-mapping frontmatter", () => {
    expect(() => parseFrontmatter("---\ntitle: [broken\n---\nBody")).toThrow("Invalid YAML frontmatter");
    expect(() => parseFrontmatter("---\ntitle: One\ntitle: Two\n---\nBody")).toThrow("Invalid YAML frontmatter");
    expect(() => parseFrontmatter("---\n- one\n- two\n---\nBody")).toThrow("top level must be a mapping");
  });

  it("rejects executable YAML tags", () => {
    expect(() =>
      parseFrontmatter("---\nrun: !!js/function >\n  function () { return true; }\n---\nBody"),
    ).toThrow("Invalid YAML frontmatter");
  });

  it("rejects circular aliases before page metadata is serialized", () => {
    expect(() => parseFrontmatter("---\nroot: &root\n  self: *root\n---\nBody")).toThrow("circular aliases");
  });
});
