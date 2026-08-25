import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { basePathFromUrl, type BuildResult, type OutputFile } from "@obsidian-githubpage/core";

const CSP = "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'";

export class PreviewServer {
  private server: Server | undefined;
  private token = randomBytes(32).toString("hex");
  private cookieName = `obsidian-githubpage-${this.token.slice(0, 12)}`;
  private result: BuildResult | undefined;
  private basePath = "";

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((request, response) => {
      try {
        this.handleRequest(request.url ?? "/", request.headers.cookie ?? "", response);
      } catch {
        response.writeHead(500, securityHeaders("text/plain; charset=utf-8"));
        response.end("Preview server error");
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => resolve());
    });
  }

  setBuild(result: BuildResult, baseUrl: string): void {
    this.result = result;
    this.basePath = basePathFromUrl(baseUrl);
  }

  getSessionUrl(route: string): string {
    const address = this.requireAddress();
    const safeRoute = route.startsWith("/") ? route : `/${route}`;
    const query = new URLSearchParams({ route: safeRoute });
    return `http://127.0.0.1:${address.port}/__session/${this.token}?${query}`;
  }

  async stop(): Promise<void> {
    const current = this.server;
    this.server = undefined;
    if (!current) return;
    await new Promise<void>((resolve) => current.close(() => resolve()));
  }

  private handleRequest(urlValue: string, cookie: string, response: ServerResponse): void {
    const requestUrl = new URL(urlValue, "http://127.0.0.1");
    if (requestUrl.pathname === `/__session/${this.token}`) {
      const route = safeRoute(requestUrl.searchParams.get("route") ?? "/");
      response.writeHead(302, {
        ...securityHeaders("text/plain; charset=utf-8"),
        "Set-Cookie": `${this.cookieName}=${this.token}; Path=/; HttpOnly; SameSite=Strict`,
        Location: `${this.sessionPrefix()}${this.basePath}${route}` || "/",
      });
      response.end();
      return;
    }
    const sessionPath = this.sessionPath(requestUrl.pathname);
    if (sessionPath === undefined && !hasValidCookie(cookie, this.cookieName, this.token)) {
      response.writeHead(403, securityHeaders("text/plain; charset=utf-8"));
      response.end("Forbidden");
      return;
    }
    const output = this.resolveOutput(sessionPath ?? requestUrl.pathname);
    if (!output) {
      response.writeHead(404, securityHeaders("text/plain; charset=utf-8"));
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      ...securityHeaders(output.mediaType),
      "Cache-Control": "no-store",
    });
    response.end(sessionPath === undefined ? output.content : this.rewriteForSession(output));
  }

  private sessionPrefix(): string {
    return `/__preview/${this.token}`;
  }

  private sessionPath(pathname: string): string | undefined {
    const prefix = this.sessionPrefix();
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return undefined;
    return pathname.slice(prefix.length) || "/";
  }

  private rewriteForSession(output: OutputFile): string | Uint8Array {
    if (!output.mediaType.toLowerCase().startsWith("text/html")) return output.content;
    const html = typeof output.content === "string" ? output.content : new TextDecoder().decode(output.content);
    const prefix = this.sessionPrefix();
    if (!this.basePath) {
      return html
        .replace(/data-base-path=["']["']/, `data-base-path="${prefix}"`)
        .replace(/((?:href|src|action|poster)=["'])\//g, `$1${prefix}/`);
    }
    const marker = escapeRegExp(this.basePath);
    return html
      .replace(new RegExp(`(["'])${marker}(?=(?:/|["']))`, "g"), `$1${prefix}${this.basePath}`);
  }

  private resolveOutput(pathname: string): OutputFile | undefined {
    if (!this.result) return undefined;
    const decoded = decodePath(pathname);
    if (this.basePath && decoded !== this.basePath && !decoded.startsWith(`${this.basePath}/`)) return undefined;
    const withoutBase = this.basePath ? decoded.slice(this.basePath.length) || "/" : decoded;
    const raw = withoutBase.replace(/^\/+/, "");
    const normalized = path.posix.normalize(raw || "index.html");
    if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return undefined;
    let outputPath: string;
    if (withoutBase.endsWith("/") || !raw) {
      const directory = normalized === "." ? "" : normalized.replace(/\/+$/, "");
      outputPath = directory ? `${directory}/index.html` : "index.html";
    } else {
      outputPath = normalized;
    }
    return this.result.outputs.get(outputPath);
  }

  private requireAddress(): AddressInfo {
    const address = this.server?.address();
    if (!address || typeof address === "string") throw new Error("Preview server is not listening");
    return address;
  }
}

function safeRoute(value: string): string {
  const normalized = path.posix.normalize(value.startsWith("/") ? value : `/${value}`);
  if (!normalized.startsWith("/") || normalized.includes("\0") || normalized.startsWith("/../")) return "/";
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "/__invalid__";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasValidCookie(cookieHeader: string, cookieName: string, token: string): boolean {
  const match = new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]+)(?:;|$)`).exec(cookieHeader);
  if (!match?.[1]) return false;
  const actual = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function securityHeaders(mediaType: string): Record<string, string> {
  return {
    "Content-Type": mediaType,
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
