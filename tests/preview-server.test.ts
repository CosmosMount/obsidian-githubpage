import { get, type IncomingHttpHeaders } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { buildSite } from "@obsidian-githubpage/core";
import { PreviewServer } from "../packages/plugin/src/preview-server";
import { project, textFile } from "./helpers";

const servers: PreviewServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe("preview server", () => {
  it("serves the index route through the session prefix", async () => {
    const result = buildSite(project([textFile("index.md", "# Home")]));
    const server = new PreviewServer();
    servers.push(server);
    await server.start();
    server.setBuild(result, "https://example.github.io/notes");

    const session = await request(server.getSessionUrl("/"));
    const location = getHeader(session, "location");
    expect(session.status).toBe(302);
    expect(location).toMatch(/^\/__preview\/[a-f0-9]{64}\/notes\/$/);
    const page = await request(new URL(location!, server.getSessionUrl("/")));
    expect(page.status).toBe(200);
    expect(page.text()).toContain("<h1 id=\"home\">Home</h1>");
  });

  it("keeps the session in the preview path when iframe cookies are blocked", async () => {
    const result = buildSite(project([textFile("index.md", "# Home"), textFile("Guide.md", "# Guide")]));
    const server = new PreviewServer();
    servers.push(server);
    await server.start();
    server.setBuild(result, "https://example.github.io/notes");

    const sessionUrl = server.getSessionUrl("/Guide/");
    expect(sessionUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/__session\//);
    const forbidden = await request(new URL("/notes/Guide/", sessionUrl));
    expect(forbidden.status).toBe(403);

    const session = await request(sessionUrl);
    expect(session.status).toBe(302);
    const cookie = getHeader(session, "set-cookie")?.split(";", 1)[0];
    expect(cookie).toBeTruthy();
    const location = getHeader(session, "location");
    expect(location).toMatch(/^\/__preview\/[a-f0-9]{64}\/notes\/Guide\/$/);
    const page = await request(new URL(location!, sessionUrl));
    expect(page.status).toBe(200);
    const pageText = page.text();
    expect(pageText).toContain('data-base-path="/__preview/');
    expect(pageText).toContain('/__preview/');
    expect(getHeader(page, "content-security-policy")).toContain("object-src 'none'");

    const asset = await request(new URL("/__preview/" + location!.split("/", 3)[2] + "/notes/_githubpage/theme.css", sessionUrl));
    expect(asset.status).toBe(200);
    expect(asset.text()).toContain("color: #222");
  });
});

interface TestResponse {
  status: number;
  headers: IncomingHttpHeaders;
  text(): string;
}

function request(url: string | URL): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          text: () => body,
        });
      });
    });
    request.on("error", reject);
  });
}

function getHeader(response: TestResponse, name: string): string | null {
  const value = response.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
