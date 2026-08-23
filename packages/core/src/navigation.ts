import path from "node:path";
import { encodeUrlPath, escapeHtml, withBasePath } from "./paths";
import type { PageRecord } from "./types";

interface NavFile {
  kind: "file";
  label: string;
  route: string;
  sourcePath: string;
}

interface NavFolder {
  kind: "folder";
  label: string;
  fullPath: string;
  children: Array<NavFolder | NavFile>;
  indexRoute?: string;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function renderNavigation(pages: PageRecord[], basePath: string, activeRoute: string): string {
  const root: NavFolder = { kind: "folder", label: "", fullPath: "", children: [] };
  for (const page of pages) insertPage(root, page);
  sortFolder(root);
  const contents = root.children.map((node) => renderNode(node, basePath, activeRoute)).join("");
  return `<nav class="site-navigation" aria-label="File explorer"><ul class="nav-tree">${contents}</ul></nav>`;
}

function insertPage(root: NavFolder, page: PageRecord): void {
  const parts = page.sourcePath.split("/");
  const fileName = parts.pop() ?? page.sourcePath;
  let folder = root;
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let child = folder.children.find((item): item is NavFolder => item.kind === "folder" && item.label === part);
    if (!child) {
      child = { kind: "folder", label: part, fullPath: currentPath, children: [] };
      folder.children.push(child);
    }
    folder = child;
  }
  if (fileName.toLocaleLowerCase("en") === "index.md") {
    folder.indexRoute = page.route;
    if (folder === root) {
      folder.children.push({ kind: "file", label: "index", route: page.route, sourcePath: page.sourcePath });
    }
    return;
  }
  folder.children.push({
    kind: "file",
    label: path.posix.basename(fileName, path.posix.extname(fileName)),
    route: page.route,
    sourcePath: page.sourcePath,
  });
}

function sortFolder(folder: NavFolder): void {
  folder.children.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return collator.compare(left.label, right.label);
  });
  for (const child of folder.children) if (child.kind === "folder") sortFolder(child);
}

function renderNode(node: NavFolder | NavFile, basePath: string, activeRoute: string): string {
  if (node.kind === "file") {
    const active = node.route === activeRoute ? ' aria-current="page"' : "";
    const href = encodeUrlPath(withBasePath(basePath, node.route));
    return `<li class="nav-file"><a href="${href}"${active}>${escapeHtml(node.label)}</a></li>`;
  }
  const children = node.children.map((child) => renderNode(child, basePath, activeRoute)).join("");
  const label = node.indexRoute
    ? `<a href="${encodeUrlPath(withBasePath(basePath, node.indexRoute))}">${escapeHtml(node.label)}</a>`
    : `<span>${escapeHtml(node.label)}</span>`;
  return `<li class="nav-folder"><details open><summary>${label}</summary><ul>${children}</ul></details></li>`;
}

export function renderBreadcrumbs(page: PageRecord, basePath: string): string {
  const parts = page.sourcePath.replace(/\.md$/i, "").split("/");
  const crumbs = ['<a href="' + encodeUrlPath(withBasePath(basePath, "/")) + '">Home</a>'];
  const routeParts: string[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.toLocaleLowerCase("en") === "index") continue;
    routeParts.push(part);
    if (index === parts.length - 1) {
      crumbs.push(`<span aria-current="page">${escapeHtml(part)}</span>`);
    } else {
      crumbs.push(`<a href="${encodeUrlPath(withBasePath(basePath, `/${routeParts.join("/")}/`))}">${escapeHtml(part)}</a>`);
    }
  }
  return `<nav class="breadcrumbs" aria-label="Breadcrumbs">${crumbs.join('<span class="separator">/</span>')}</nav>`;
}
