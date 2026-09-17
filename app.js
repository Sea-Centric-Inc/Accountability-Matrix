(function () {
  "use strict";

  const COMPLETE_WORDS = ["complete", "completed", "done"];
  const BLOCKED_WORDS = ["blocked", "at risk", "delayed", "stuck"];
  const IN_PROGRESS_WORDS = ["in progress", "active", "ongoing", "underway"];

  const ROLE_FIELDS = [
    { field: "responsible", label: "Responsible", slug: "r" },
    { field: "accountable", label: "Accountable", slug: "a" },
    { field: "consulted", label: "Consulted", slug: "c" },
    { field: "informed", label: "Informed", slug: "i" }
  ];

  const state = {
    items: [],
    search: "",
    status: "",
    category: "",
    hideCompleted: false,
    person: ""
  };

  let els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els = {
      sheetName: document.getElementById("sheet-name"),
      generatedAt: document.getElementById("generated-at"),
      printBtn: document.getElementById("print-btn"),
      search: document.getElementById("search"),
      statusFilter: document.getElementById("status-filter"),
      categoryFilter: document.getElementById("category-filter"),
      hideCompleted: document.getElementById("hide-completed"),
      matrixRoot: document.getElementById("matrix-root"),
      byPersonToggle: document.getElementById("by-person-toggle"),
      byPersonBody: document.getElementById("by-person-body"),
      personSelect: document.getElementById("person-select"),
      byPersonResults: document.getElementById("by-person-results")
    };

    readStateFromUrl();

    els.printBtn.addEventListener("click", () => window.print());
    els.search.addEventListener("input", () => {
      state.search = els.search.value;
      writeStateToUrl();
      render();
    });
    els.statusFilter.addEventListener("change", () => {
      state.status = els.statusFilter.value;
      writeStateToUrl();
      render();
    });
    els.categoryFilter.addEventListener("change", () => {
      state.category = els.categoryFilter.value;
      writeStateToUrl();
      render();
    });
    els.hideCompleted.addEventListener("change", () => {
      state.hideCompleted = els.hideCompleted.checked;
      writeStateToUrl();
      render();
    });
    els.personSelect.addEventListener("change", () => {
      state.person = els.personSelect.value;
      writeStateToUrl();
      renderByPerson();
      renderTable(getFilteredItems());
    });
    els.byPersonToggle.addEventListener("click", () => togglePanel(els.byPersonBody, els.byPersonToggle));

    els.search.value = state.search;
    els.hideCompleted.checked = state.hideCompleted;

    loadData();
  }

  function togglePanel(body, toggleBtn) {
    const collapsed = body.classList.toggle("collapsed");
    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    toggleBtn.textContent = collapsed ? "Show" : "Hide";
  }

  function readStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    state.search = params.get("q") || "";
    state.status = params.get("status") || "";
    state.category = params.get("category") || "";
    state.hideCompleted = params.get("hideCompleted") === "1";
    state.person = params.get("person") || "";
  }

  function writeStateToUrl() {
    const params = new URLSearchParams();
    if (state.search) params.set("q", state.search);
    if (state.status) params.set("status", state.status);
    if (state.category) params.set("category", state.category);
    if (state.hideCompleted) params.set("hideCompleted", "1");
    if (state.person) params.set("person", state.person);
    const query = params.toString();
    const newUrl = window.location.pathname + (query ? "?" + query : "");
    window.history.replaceState(null, "", newUrl);
  }

  async function loadData() {
    try {
      const res = await fetch("data/matrix-data.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.items = Array.isArray(data.items) ? data.items : [];

      els.sheetName.textContent = data.sheetName || "Accountability Matrix";
      if (data.generatedAt) {
        const d = new Date(data.generatedAt);
        els.generatedAt.textContent = "Updated " + d.toLocaleString();
      }

      populateFilterOptions();
      populatePersonOptions();
      if (state.person) {
        els.byPersonBody.classList.remove("collapsed");
        els.byPersonToggle.setAttribute("aria-expanded", "true");
        els.byPersonToggle.textContent = "Hide";
      }
      render();
    } catch (err) {
      els.matrixRoot.innerHTML =
        '<p class="status-message">Could not load matrix data (' + escapeHtml(err.message) + ").</p>";
    }
  }

  function populateFilterOptions() {
    const statuses = uniqueSorted(state.items.map((i) => i.status).filter(Boolean));
    const categories = uniqueSorted(state.items.map((i) => i.category).filter(Boolean));

    fillSelect(els.statusFilter, statuses, state.status, "All statuses");
    fillSelect(els.categoryFilter, categories, state.category, "All categories");
  }

  function fillSelect(select, values, selected, allLabel) {
    select.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = allLabel;
    select.appendChild(allOpt);
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    select.value = selected;
  }

  function populatePersonOptions() {
    const people = getAllPeople(state.items);
    els.personSelect.innerHTML = '<option value="">Select a person&hellip;</option>';
    people.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      els.personSelect.appendChild(opt);
    });
    els.personSelect.value = state.person;
  }

  function splitNames(raw) {
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function getAllPeople(items) {
    const set = new Set();
    items.forEach((item) => {
      ROLE_FIELDS.forEach(({ field }) => {
        splitNames(item[field]).forEach((name) => set.add(name));
      });
    });
    return uniqueSorted(Array.from(set));
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
  }

  function statusSlug(status) {
    const s = (status || "").toLowerCase().trim();
    if (!s) return "not-started";
    if (COMPLETE_WORDS.some((w) => s.includes(w))) return "complete";
    if (BLOCKED_WORDS.some((w) => s.includes(w))) return "blocked";
    if (IN_PROGRESS_WORDS.some((w) => s.includes(w))) return "in-progress";
    return "not-started";
  }

  function itemHasPerson(item, person) {
    if (!person) return false;
    return ROLE_FIELDS.some(({ field }) => splitNames(item[field]).includes(person));
  }

  function getFilteredItems() {
    const q = state.search.trim().toLowerCase();
    return state.items.filter((item) => {
      if (state.status && item.status !== state.status) return false;
      if (state.category && item.category !== state.category) return false;
      if (state.hideCompleted && statusSlug(item.status) === "complete") return false;
      if (q) {
        const haystack = [
          item.task,
          item.category,
          item.responsible,
          item.accountable,
          item.consulted,
          item.informed
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function render() {
    const filtered = getFilteredItems();
    renderTable(filtered);
    renderByPerson();
  }

  function renderRoleCell(item, field, slug) {
    const names = splitNames(item[field]);
    if (!names.length) return "";
    return names
      .map(
        (name) =>
          '<span class="role-cell-' +
          slug +
          '"><span class="role-dot role-dot-' +
          slug +
          '"></span>' +
          escapeHtml(name) +
          "</span>"
      )
      .join(", ");
  }

  function renderTable(items) {
    if (!items.length) {
      els.matrixRoot.innerHTML = '<p class="status-message">No matching tasks.</p>';
      return;
    }

    const rows = items
      .map((item) => {
        const slug = statusSlug(item.status);
        const highlighted = state.person && itemHasPerson(item, state.person);
        const taskCell = item.link
          ? '<a class="task-name" href="' +
            escapeAttr(item.link) +
            '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(item.task) +
            "</a>"
          : '<span class="task-name">' + escapeHtml(item.task) + "</span>";

        return (
          '<tr class="' +
          (highlighted ? "person-highlight" : "") +
          '">' +
          "<td>" +
          taskCell +
          "</td>" +
          "<td>" +
          escapeHtml(item.category || "—") +
          "</td>" +
          "<td>" +
          (renderRoleCell(item, "responsible", "r") || "—") +
          "</td>" +
          "<td>" +
          (renderRoleCell(item, "accountable", "a") || "—") +
          "</td>" +
          "<td>" +
          (renderRoleCell(item, "consulted", "c") || "—") +
          "</td>" +
          "<td>" +
          (renderRoleCell(item, "informed", "i") || "—") +
          "</td>" +
          "<td><span class=\"status-pill status-" +
          slug +
          '">' +
          escapeHtml(item.status || "Not Started") +
          "</span></td>" +
          "<td>" +
          escapeHtml(item.dueDate || "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    els.matrixRoot.innerHTML =
      '<div class="matrix-table-wrap"><table class="matrix-table"><thead><tr>' +
      "<th>Task / Deliverable</th><th>Category</th><th>Responsible</th><th>Accountable</th>" +
      "<th>Consulted</th><th>Informed</th><th>Status</th><th>Due Date</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>";
  }

  function renderByPerson() {
    const person = state.person;
    if (!person) {
      els.byPersonResults.innerHTML =
        '<p class="status-message">Pick a person to see their responsibilities across the matrix.</p>';
      return;
    }

    const counts = { r: 0, a: 0, c: 0, i: 0 };
    const ownedItems = [];

    state.items.forEach((item) => {
      ROLE_FIELDS.forEach(({ field, slug }) => {
        if (splitNames(item[field]).includes(person)) {
          counts[slug]++;
          if (slug === "r" || slug === "a") {
            if (!ownedItems.includes(item)) ownedItems.push(item);
          }
        }
      });
    });

    const pillsHtml =
      '<div class="role-count-row">' +
      ROLE_FIELDS.map(
        ({ label, slug }) =>
          '<span class="role-count-pill"><span class="role-dot role-dot-' +
          slug +
          '"></span>' +
          label +
          ": <strong>" +
          counts[slug] +
          "</strong></span>"
      ).join("") +
      "</div>";

    if (!ownedItems.length) {
      els.byPersonResults.innerHTML =
        pillsHtml + '<p class="status-message">No tasks where ' + escapeHtml(person) + " is Responsible or Accountable.</p>";
      return;
    }

    const listHtml =
      '<ul class="gap-list">' +
      ownedItems
        .map((item) => {
          const slug = statusSlug(item.status);
          return (
            '<li class="gap-item"><span class="gap-dates">' +
            escapeHtml(item.task) +
            '</span><span class="status-pill status-' +
            slug +
            '">' +
            escapeHtml(item.status || "Not Started") +
            "</span></li>"
          );
        })
        .join("") +
      "</ul>";

    els.byPersonResults.innerHTML = pillsHtml + listHtml;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => {
      switch (c) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return c;
      }
    });
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }
})();
