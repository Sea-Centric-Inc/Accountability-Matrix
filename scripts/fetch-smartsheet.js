#!/usr/bin/env node
"use strict";

/**
 * Pulls a sheet from Smartsheet and writes it to data/matrix-data.json in the
 * shape the Accountability Matrix frontend expects. Run via `npm run fetch-data`.
 *
 * Required environment variables:
 *   SMARTSHEET_ACCESS_TOKEN - Smartsheet API access token
 *   SMARTSHEET_SHEET_ID     - Numeric ID of the sheet to pull
 *
 * Column mapping (which Smartsheet column title feeds which field) lives in
 * config/smartsheet-map.json so it can be edited without touching this script.
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
  // Smartsheet text/contact cells can contain embedded line breaks that
  // render fine in a browser but break exact-match comparisons in JS.
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value;
}

function toDateString(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  const s = String(raw);
  const match = s.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

async function main() {
  if (!TOKEN) fail("SMARTSHEET_ACCESS_TOKEN environment variable is not set.");
  if (!SHEET_ID) fail("SMARTSHEET_SHEET_ID environment variable is not set.");

  const rawMap = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
  const fieldToTitle = {};
  Object.keys(rawMap).forEach((key) => {
    if (key.startsWith("_")) return;
    fieldToTitle[key] = rawMap[key];
  });

  const url = "https://api.smartsheet.com/2.0/sheets/" + encodeURIComponent(SHEET_ID) + "?include=rowPermalink";
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + TOKEN }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail("Smartsheet API request failed (" + res.status + " " + res.statusText + "): " + body);
  }

  const sheet = await res.json();

  const columnIdsByField = {};
  Object.keys(fieldToTitle).forEach((field) => {
    const titles = fieldToTitle[field];
    if (!titles) return; // "" means this field has no column in the sheet

    const titleList = Array.isArray(titles) ? titles : [titles];
    const ids = [];
    titleList.forEach((title) => {
      const col = (sheet.columns || []).find((c) => c.title === title);
      if (col) {
        ids.push(col.id);
      } else {
        console.warn("WARNING: no column titled \"" + title + "\" found for field \"" + field + "\". Check config/smartsheet-map.json.");
      }
    });
    columnIdsByField[field] = ids;
  });

  if (!columnIdsByField.task || columnIdsByField.task.length === 0) {
    fail("Could not find the task column(s) in the sheet. Update config/smartsheet-map.json to match your sheet's column titles.");
  }

  const items = [];
  (sheet.rows || []).forEach((row) => {
    const cellByColumnId = {};
    (row.cells || []).forEach((cell) => {
      cellByColumnId[cell.columnId] = cell;
    });

    const get = (field) => {
      const ids = columnIdsByField[field] || [];
      return ids
        .map((id) => cellValue(cellByColumnId[id]))
        .filter((v) => v !== "" && v !== undefined && v !== null)
        .join(" – ");
    };

    const task = get("task");
    if (!task) return; // skip blank / section-header rows

    items.push({
      id: String(row.id),
      task: String(task),
      category: String(get("category") || ""),
      responsible: String(get("responsible") || ""),
      accountable: String(get("accountable") || ""),
      consulted: String(get("consulted") || ""),
      informed: String(get("informed") || ""),
      status: String(get("status") || ""),
      dueDate: toDateString(get("dueDate")),
      link: row.permalink || ""
    });
  });

  const output = {
    generatedAt: new Date().toISOString(),
    source: "smartsheet",
    sheetName: sheet.name || "Accountability Matrix",
    items
  };

  if (items.length && !items.some((t) => t.link)) {
    console.warn("WARNING: none of the fetched rows had a permalink. Row links won't work. Check that this Smartsheet account/API supports ?include=rowPermalink.");
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log("Wrote " + items.length + " item(s) from \"" + output.sheetName + "\" to " + path.relative(process.cwd(), OUTPUT_PATH));
}

main().catch((err) => fail(err.stack || err.message || String(err)));
