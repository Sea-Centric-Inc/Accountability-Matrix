(function () {
  "use strict";

  const STATUS_LABELS = {
    complete: "Submitted",
    "in-progress": "In Progress",
    blocked: "At Risk",
    "not-started": "Not Started"
  };
  const STATUS_ORDER = ["complete", "in-progress", "blocked", "not-started"];

  const state = {
    items: [],
    search: "",
    status: "",
    department: "",
    hideCompleted: false,
    deptFocus: ""
  };

  let els = {};
  const today = new Date().toISOString().slice(0, 10);

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els = {
      sheetName: document.getElementById("sheet-name"),
      generatedAt: document.getElementById("generated-at"),
      printBtn: document.getElementById("print-btn"),
      search: document.getElementById("search"),
      statusFilter: document.getElementById("status-filter"),
      departmentFilter: document.getElementById("department-filter"),
      hideCompleted: document.getElementById("hide-completed"),
      matrixRoot: document.getElementById("matrix-root"),
      byDeptToggle: document.getElementById("by-dept-toggle"),
      byDeptBody: document.getElementById("by-dept-body"),
      deptSelect: document.getElementById("dept-select"),
      byDeptResults: document.getElementById("by-dept-results")
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
    els.departmentFilter.addEventListener("change", () => {
      state.department = els.departmentFilter.value;
      writeStateToUrl();
      render();
    });
    els.hideCompleted.addEventListener("change", () => {
      state.hideCompleted = els.hideCompleted.checked;
      writeStateToUrl();
      render();
    });
    els.deptSelect.addEventListener("change", () => {
      state.deptFocus = els.deptSelect.value;
      writeStateToUrl();
      renderByDepartment();
      renderTable(getFilteredItems());
    });
    els.byDeptToggle.addEventListener("click", () => togglePanel(els.byDeptBody, els.byDeptToggle));

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
    state.department = params.get("department") || "";
    state.hideCompleted = params.get("hideCompleted") === "1";
    state.deptFocus = params.get("deptFocus") || "";
  }

  function writeStateToUrl() {
    const params = new URLSearchParams();
    if (state.search) params.set("q", state.search);
    if (state.status) params.set("status", state.status);
    if (state.department) params.set("department", state.department);
    if (state.hideCompleted) params.set("hideCompleted", "1");
    if (state.deptFocus) params.set("deptFocus", state.deptFocus);
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? "?" + query : ""));
  }

  async function loadData() {
    try {
      const res = await fetch("data/matrix-data.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.items = Array.isArray(data.items) ? data.items : [];

      els.sheetName.textContent = data.sheetName || "Accountability Matrix";
      if (data.generatedAt) {
        els.generatedAt.textContent = "Updated " + new Date(data.generatedAt).toLocaleString();
      }

      populateFilterOptions();
      populateDepartmentOptions();
      if (state.deptFocus) {
        els.byDeptBody.classList.remove("collapsed");
        els.byDeptToggle.setAttribute("aria-expanded", "true");
        els.byDeptToggle.textContent = "Hide";
      }
      render();
    } catch (err) {
      els.matrixRoot.innerHTML =
        '<p class="status-message">Could not load matrix data (' + escapeHtml(err.message) + ").</p>";
    }
  }

  function getAllDepartments(items) {
    const set = new Set();
    items.forEach((item) => {
      Object.keys(item.departments || {}).forEach((d) => set.add(d));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function populateFilterOptions() {
    const statuses = STATUS_ORDER.filter((slug) => state.items.some((i) => itemStatus(i) === slug));
    els.statusFilter.innerHTML = '<option value="">All statuses</option>';
    statuses.forEach((slug) => {
      const opt = document.createElement("option");
      opt.value = slug;
      opt.textContent = STATUS_LABELS[slug];
      els.statusFilter.appendChild(opt);
    });
    els.statusFilter.value = state.status;
  }

  function populateDepartmentOptions() {
    const depts = getAllDepartments(state.items);

    els.departmentFilter.innerHTML = '<option value="">All departments</option>';
    els.deptSelect.innerHTML = '<option value="">Select a department&hellip;</option>';
    depts.forEach((d) => {
      const opt1 = document.createElement("option");
      opt1.value = d;
      opt1.textContent = d;
      els.departmentFilter.appendChild(opt1);

      const opt2 = document.createElement("option");
      opt2.value = d;
      opt2.textContent = d;
      els.deptSelect.appendChild(opt2);
    });
    els.departmentFilter.value = state.department;
    els.deptSelect.value = state.deptFocus;
  }

  function stageStatus(stage) {
    if (stage.actual) {
      return stage.planned && stage.actual > stage.planned ? "late" : "done";
    }
    if (stage.planned && stage.planned < today) return "overdue";
    return "pending";
  }

  function itemStatus(item) {
    const stages = item.stages || [];
    const submission = stages[stages.length - 1];
    if (submission && submission.actual) return "complete";
    if (stages.some((s) => stageStatus(s) === "overdue")) return "blocked";
    if (stages.some((s) => s.actual)) return "in-progress";
    return "not-started";
  }

  function getFilteredItems() {
    const q = state.search.trim().toLowerCase();
    return state.items.filter((item) => {
      if (state.status && itemStatus(item) !== state.status) return false;
      if (state.department && !(item.departments && item.departments[state.department])) return false;
      if (state.hideCompleted && itemStatus(item) === "complete") return false;
      if (q) {
        const deptText = Object.keys(item.departments || {})
          .map((d) => d + " " + item.departments[d])
          .join(" ");
        const haystack = [item.title, item.number, item.client, item.lead, item.submissionMethod, deptText]
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
    renderByDepartment();
  }

  function renderDeptChips(item) {
    const depts = Object.keys(item.departments || {});
    if (!depts.length) return "—";
    return depts
      .map((d) => {
        const val = item.departments[d];
        const label = /^(x|yes|true|1|✓|checked)$/i.test(val) ? d : d + ": " + val;
        return '<span class="dept-chip">' + escapeHtml(label) + "</span>";
      })
      .join(" ");
  }

  function renderStageStepper(item) {
    const stages = item.stages || [];
    if (!stages.length) return "—";
    return (
      '<span class="stage-stepper">' +
      stages
        .map((s) => {
          const slug = stageStatus(s);
          const title = s.label + ": planned " + (s.planned || "—") + ", actual " + (s.actual || "—");
          return '<span class="stage-dot stage-dot-' + slug + '" title="' + escapeAttr(title) + '"></span>';
        })
        .join("") +
      "</span>"
    );
  }

  function renderTable(items) {
    if (!items.length) {
      els.matrixRoot.innerHTML = '<p class="status-message">No matching proposals.</p>';
      return;
    }

    const rows = items
      .map((item) => {
        const slug = itemStatus(item);
        const highlighted = state.deptFocus && item.departments && item.departments[state.deptFocus];
        const titleCell = item.link
          ? '<a class="task-name" href="' +
            escapeAttr(item.link) +
            '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(item.title) +
            "</a>"
          : '<span class="task-name">' + escapeHtml(item.title) + "</span>";
        const numberLine = item.number ? '<div class="task-meta">' + escapeHtml(item.number) + "</div>" : "";

        return (
          '<tr class="' +
          (highlighted ? "person-highlight" : "") +
          '">' +
          "<td>" + titleCell + numberLine + "</td>" +
          "<td>" + escapeHtml(item.client || "—") + "</td>" +
          "<td>" + escapeHtml(item.lead || "—") + "</td>" +
          "<td>" + renderDeptChips(item) + "</td>" +
          "<td>" + escapeHtml(item.submissionDeadline || "—") + "</td>" +
          "<td>" + renderStageStepper(item) + "</td>" +
          '<td><span class="status-pill status-' + slug + '">' + STATUS_LABELS[slug] + "</span></td>" +
          "</tr>"
        );
      })
      .join("");

    els.matrixRoot.innerHTML =
      '<div class="matrix-table-wrap"><table class="matrix-table"><thead><tr>' +
      "<th>RFP</th><th>Client</th><th>Lead</th><th>Departments</th><th>Deadline</th><th>Pipeline</th><th>Status</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>";
  }

  function renderByDepartment() {
    const dept = state.deptFocus;
    if (!dept) {
      els.byDeptResults.innerHTML =
        '<p class="status-message">Pick a department to see the proposals it\'s accountable for.</p>';
      return;
    }

    const items = state.items.filter((item) => item.departments && item.departments[dept]);

    const counts = { complete: 0, "in-progress": 0, blocked: 0, "not-started": 0 };
    items.forEach((item) => counts[itemStatus(item)]++);

    const pillsHtml =
      '<div class="role-count-row">' +
      STATUS_ORDER.map(
        (slug) =>
          '<span class="role-count-pill"><span class="swatch swatch-' +
          slug +
          '"></span>' +
          STATUS_LABELS[slug] +
          ": <strong>" +
          counts[slug] +
          "</strong></span>"
      ).join("") +
      "</div>";

    if (!items.length) {
      els.byDeptResults.innerHTML = pillsHtml + '<p class="status-message">No proposals involve ' + escapeHtml(dept) + " yet.</p>";
      return;
    }

    const listHtml =
      '<ul class="gap-list">' +
      items
        .map((item) => {
          const slug = itemStatus(item);
          return (
            '<li class="gap-item"><span class="gap-dates">' +
            escapeHtml(item.title) +
            '</span><span class="status-pill status-' +
            slug +
            '">' +
            STATUS_LABELS[slug] +
            "</span></li>"
          );
        })
        .join("") +
      "</ul>";

    els.byDeptResults.innerHTML = pillsHtml + listHtml;
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
