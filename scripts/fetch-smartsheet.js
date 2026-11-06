#!/usr/bin/env node
"use strict";

/**
 * Pulls the RFP/proposal tracker sheet from Smartsheet and writes it to
 * data/matrix-data.json in the shape the frontend expects. Run via
 * `npm run fetch-data`.
 *
 * Environment variables:
 *   SMARTSHEET_ACCESS_TOKEN - Smartsheet API access token (required)
 *   SMARTSHEET_SHEET_ID     - Fallback sheet ID, used only if
 *                             config/smartsheet-map.json has no "sheetId"
 *
 * Sheet ID and column mapping live in config/smartsheet-map.json so they can
 * be edited without touching this script.
 */

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.SMARTSHEET_ACCESS_TOKEN;
const MAP_PATH = path.join(__dirname, "..", "config", "smartsheet-map.json");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "matrix-data.json");

function fail(message) {
  console.error("ERROR: " + message);
  process.exit(1);
}

function cellValue(cell) {
  if (!cell) return "";
  let value = "";
  if (cell.displayValue !== undefined && cell.displayValue !== null && cell.displayValue !== "") {
    value = cell.displayValue;
  } else if (cell.value !== undefined && cell.value !== null) {
    value = cell.value;
  }
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value;
}

function toDateString(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  const s = String(raw);
  const match = s.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function findColumnId(columns, title) {
  const col = columns.find((c) => c.title === title);
  if (!col) {
    console.warn("WARNING: no column titled \"" + title + "\" found. Check config/smartsheet-map.json.");
    return null;
  }
  return col.id;
}

async function main() {
  const map = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
  const SHEET_ID = map.sheetId || process.env.SMARTSHEET_SHEET_ID;

  if (!TOKEN) fail("SMARTSHEET_ACCESS_TOKEN environment variable is not set.");
  if (!SHEET_ID) fail("No sheet ID: set \"sheetId\" in config/smartsheet-map.json or the SMARTSHEET_SHEET_ID environment variable.");

  const url = "https://api.smartsheet.com/2.0/sheets/" + encodeURIComponent(SHEET_ID) + "?include=rowPermalink";
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + TOKEN }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail("Smartsheet API request failed (" + res.status + " " + res.statusText + "): " + body);
  }

  const sheet = await res.json();
  const columns = sheet.columns || [];

  const simpleFields = ["title", "number", "client", "lead", "submissionMethod", "submissionDeadline", "referenceDocs"];
  const simpleColIds = {};
  simpleFields.forEach((field) => {
    const title = map[field];
    if (title) simpleColIds[field] = findColumnId(columns, title);
  });

  if (!simpleColIds.title) {
    fail("Could not find the RFP title column in the sheet. Update config/smartsheet-map.json to match your sheet's column titles.");
  }

  const deptColIds = {};
  Object.keys(map.departments || {}).forEach((label) => {
    if (label.startsWith("_")) return;
    const title = map.departments[label];
    deptColIds[label] = findColumnId(columns, title);
  });

  const stageColIds = (map.stages || []).map((stage) => ({
    label: stage.label,
    plannedId: findColumnId(columns, stage.planned),
    actualId: findColumnId(columns, stage.actual)
  }));

  const delivMap = map.deliverables || {};
  const delivFields = ["itemNo", "rfpTitle", "description", "link", "owner", "dueDate", "status", "complete"];
  const delivColIds = {};
  delivFields.forEach((field) => {
    if (delivMap[field]) delivColIds[field] = findColumnId(columns, delivMap[field]);
  });

  const items = [];
  const deliverableRows = [];
  (sheet.rows || []).forEach((row) => {
    const cellByColumnId = {};
    (row.cells || []).forEach((cell) => {
      cellByColumnId[cell.columnId] = cell;
    });
    const get = (colId) => (colId ? cellValue(cellByColumnId[colId]) : "");
    const hyperlink = (colId) => {
      const cell = colId && cellByColumnId[colId];
      return (cell && cell.hyperlink && cell.hyperlink.url) || "";
    };

    const title = get(simpleColIds.title);

    // A row can carry a deliverable on its own or alongside a proposal.
    const hasDeliverable = ["itemNo", "description", "owner", "dueDate", "link"].some((f) => get(delivColIds[f]));
    if (hasDeliverable) {
      const complete = get(delivColIds.complete);
      deliverableRows.push({
        id: String(row.id),
        itemNo: String(get(delivColIds.itemNo) || ""),
        rfpTitle: String(get(delivColIds.rfpTitle) || title || ""),
        description: String(get(delivColIds.description) || ""),
        linkText: String(get(delivColIds.link) || ""),
        linkUrl: hyperlink(delivColIds.link),
        owner: String(get(delivColIds.owner) || ""),
        dueDate: toDateString(get(delivColIds.dueDate)),
        status: String(get(delivColIds.status) || ""),
        complete: complete === true || /^(true|yes|1)$/i.test(String(complete)),
        link: row.permalink || ""
      });
    }

    if (!title) return; // rows without an RFP Title are not proposals

    const departments = {};
    Object.keys(deptColIds).forEach((label) => {
      const val = get(deptColIds[label]);
      if (val) departments[label] = String(val);
    });

    const stages = stageColIds.map((stage) => ({
      label: stage.label,
      planned: toDateString(get(stage.plannedId)),
      actual: toDateString(get(stage.actualId))
    }));

    items.push({
      id: String(row.id),
      title: String(title),
      number: String(get(simpleColIds.number) || ""),
      client: String(get(simpleColIds.client) || ""),
      lead: String(get(simpleColIds.lead) || ""),
      submissionMethod: String(get(simpleColIds.submissionMethod) || ""),
      submissionDeadline: toDateString(get(simpleColIds.submissionDeadline)),
      referenceDocs: String(get(simpleColIds.referenceDocs) || ""),
      referenceDocsUrl: hyperlink(simpleColIds.referenceDocs),
      departments,
      stages,
      deliverables: [],
      link: row.permalink || ""
    });
  });

  // Attach each deliverable to the proposal whose title it names.
  const byTitle = new Map(items.map((item) => [item.title.trim().toLowerCase(), item]));
  const unassignedDeliverables = [];
  deliverableRows.forEach((d) => {
    const target = byTitle.get(d.rfpTitle.trim().toLowerCase());
    if (target) target.deliverables.push(d);
    else unassignedDeliverables.push(d);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    source: "smartsheet",
    sheetName: sheet.name || "Accountability Matrix",
    sheetLink: sheet.permalink || "",
    items,
    unassignedDeliverables
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(
    "Wrote " + items.length + " item(s) and " + deliverableRows.length + " deliverable(s) from \"" +
      output.sheetName + "\" to " + path.relative(process.cwd(), OUTPUT_PATH)
  );
}

main().catch((err) => fail(err.stack || err.message || String(err)));
