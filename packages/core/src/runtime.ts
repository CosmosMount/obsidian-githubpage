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
