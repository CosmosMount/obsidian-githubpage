export const BUILTIN_RUNTIME = `(() => {
  const root = document.documentElement;
  const basePath = root.dataset.basePath || "";
  const storedTheme = localStorage.getItem("githubpage-theme");
  if (storedTheme) root.dataset.theme = storedTheme;

  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("githubpage-theme", next);
  });

  const layout = document.querySelector(".site-layout");
  document.querySelectorAll("[data-sidebar-toggle]").forEach((control) => {
    if (!(control instanceof HTMLButtonElement) || !(layout instanceof HTMLElement)) return;
    const side = control.dataset.sidebarToggle;
    const panelId = control.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if ((side !== "left" && side !== "right") || !(panel instanceof HTMLElement)) return;
    const storageKey = "githubpage-sidebar-" + side;
    let collapsed = false;
    try { collapsed = localStorage.getItem(storageKey) === "collapsed"; } catch { /* storage is optional */ }
    const apply = (next: boolean) => {
      collapsed = next;
      panel.classList.toggle("is-collapsed", collapsed);
      layout.dataset[side + "Collapsed"] = String(collapsed);
      control.setAttribute("aria-expanded", String(!collapsed));
      control.setAttribute("aria-label", (collapsed ? "展开" : "折叠") + (side === "left" ? "左侧目录" : "右侧目录"));
      control.textContent = collapsed ? "+" : "−";
    };
    apply(collapsed);
    control.addEventListener("click", () => {
      apply(!collapsed);
      try { localStorage.setItem(storageKey, collapsed ? "collapsed" : "expanded"); } catch { /* storage is optional */ }
    });
  });

  const search = document.querySelector("[data-site-search]");
  const results = document.querySelector("[data-search-results]");
  if (search instanceof HTMLInputElement && results instanceof HTMLElement) {
    let indexPromise;
    search.addEventListener("input", async () => {
      const query = search.value.trim().toLocaleLowerCase();
      if (!query) { results.replaceChildren(); results.hidden = true; return; }
      indexPromise ||= fetch(basePath + "/search-index.json").then((response) => response.json());
      const index = await indexPromise;
      const matches = index.filter((item) => (item.title + " " + item.text).toLocaleLowerCase().includes(query)).slice(0, 12);
      results.replaceChildren(...matches.map((item) => {
        const link = document.createElement("a");
        link.href = basePath + item.route;
        link.textContent = item.title;
        return link;
      }));
      results.hidden = matches.length === 0;
    });
  }
})();\n`;
