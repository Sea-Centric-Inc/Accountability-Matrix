#!/usr/bin/env node
"use strict";

/**
 * Pulls the RFP/proposal tracker sheet from Smartsheet and writes it to
 * data/matrix-data.json in the shape the frontend expects. Run via
 * `npm run fetch-data`.
 *
 * Required environment variables:
 *   SMARTSHEET_ACCESS_TOKEN - Smartsheet API access token
 *   SMARTSHEET_SHEET_ID     - Numeric ID of the sheet to pull
 *
 * Column mapping lives in config/smartsheet-map.json so it can be edited
 * without touching this script.
 */

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.SMARTSHEET_ACCESS_TOKEN;
const SHEET_ID = process.env.SMARTSHEET_SHEET_ID;
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
  if (!TOKEN) fail("SMARTSHEET_ACCESS_TOKEN environment variable is not set.");
  if (!SHEET_ID) fail("SMARTSHEET_SHEET_ID environment variable is not set.");

  const map = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));

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

  const items = [];
  (sheet.rows || []).forEach((row) => {
    const cellByColumnId = {};
    (row.cells || []).forEach((cell) => {
      cellByColumnId[cell.columnId] = cell;
    });
    const get = (colId) => (colId ? cellValue(cellByColumnId[colId]) : "");

    const title = get(simpleColIds.title);
    if (!title) return; // skip blank / section-header rows

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
      departments,
      stages,
      link: row.permalink || ""
    });
  });

  const output = {
    generatedAt: new Date().toISOString(),
    source: "smartsheet",
    sheetName: sheet.name || "Accountability Matrix",
    items
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log("Wrote " + items.length + " item(s) from \"" + output.sheetName + "\" to " + path.relative(process.cwd(), OUTPUT_PATH));
}

main().catch((err) => fail(err.stack || err.message || String(err)));
