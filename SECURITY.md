# Security policy

## Trust boundary

The plugin reads the current Vault, serves a production-equivalent preview on loopback, and invokes the system `git` executable. It does not collect telemetry or store GitHub credentials.

- Preview HTTP binds only to `127.0.0.1`, requires an unguessable per-instance session cookie, sends a restrictive CSP, and never writes generated files into the Vault.
- Git commands use argument arrays with `shell: false`. The Vault root must equal the Git top-level directory. The plugin never force-pushes, automatically stashes, or overwrites conflicts.
- Theme templates reject scripts, event handlers, executable embeds, external resources and redirects. CSS rejects imports, external URLs, expressions and JavaScript URLs. Active SVG content is rejected.
- Markdown raw HTML is disabled. Built-in interactive JavaScript is bundled with the reviewed renderer.

## Sensitive content

`draft: true`, `publish: false`, and exclude patterns only remove pages from the generated site. They do not remove files from the repository, commit history, forks, caches, or GitHub access. Do not commit secrets or private notes.

## Reporting

Do not disclose exploitable vulnerabilities in a public issue. Contact the repository maintainers privately with the affected version, reproduction steps, impact, and any suggested mitigation.
