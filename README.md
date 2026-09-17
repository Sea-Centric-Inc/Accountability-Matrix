# Accountability Matrix

A RACI-style accountability matrix (Responsible / Accountable / Consulted /
Informed) for tasks and deliverables, pulled from a Smartsheet and displayed
as a static site - same pipeline as the
[Marine Ops Schedule](https://github.com/Sea-Centric-Inc/Marine-Ops.-Schedule)
site, just a table instead of a Gantt chart.

## How it works

```
Smartsheet  --(GitHub Action, every 30 min)-->  data/matrix-data.json  --> index.html (GitHub Pages)
```

- `scripts/fetch-smartsheet.js` calls the Smartsheet API and writes the result
  to `data/matrix-data.json`.
- `.github/workflows/update-data.yml` runs that script on a schedule (and on
  demand) using a token stored as a GitHub secret, then commits the updated
  JSON file. **The Smartsheet token never reaches the browser** - only the
  already-fetched data does.
- `index.html` / `app.js` / `style.css` are a plain static site (no build
  step) that reads `data/matrix-data.json` and renders the matrix table, with
  search, status/category filters, and a per-person "who owns what" summary.

Right now `data/matrix-data.json` contains sample data so you can see the
table working immediately. Once you wire up Smartsheet (below), the Action
will overwrite it with real data.

## Features

- **Matrix table** - one row per task/deliverable, with Responsible,
  Accountable, Consulted, and Informed columns. A cell can hold multiple
  names (comma-separated in Smartsheet, e.g. a contact-list column) and they
  render as separate, role-colored names. Task names link directly to that
  row in Smartsheet wherever a permalink was available from the sync.
- **Search, status filter, category filter, hide-completed** - the toolbar
  above the table; search matches the task name, category, and every
  person across all four roles.
- **By Person** - pick a person, see every task where they're Responsible or
  Accountable, plus a count of their appearances in all four roles. Matching
  rows are also highlighted in the table below.
- **Shareable links** - your current search, filters, and selected person are
  kept in the URL, so you can copy/paste a link to a specific view.
- **Print / Export PDF** - button in the header; use your browser's print
  dialog to save as PDF.

## Restricting access to seacentric.ca accounts (Azure Static Web Apps)

Same approach as the Marine Ops site:
[`staticwebapp.config.json`](staticwebapp.config.json) requires Microsoft
Entra ID (Azure AD) sign-in on every route. It has no effect on GitHub Pages
(no access control there at all) - if you enable GitHub Pages for this repo,
disable it once Azure is the deployment you actually want people using. See
the Marine Ops README's "Restricting access" section for the full app
registration walkthrough (register an app in Entra ID single-tenant, add
`AAD_CLIENT_ID` / `AAD_CLIENT_SECRET` as Static Web App settings) - the
steps are identical, just point the redirect URI at this app's hostname.

## One-time setup

### 1. Enable GitHub Pages (or Azure Static Web Apps)

Repo **Settings → Pages → Build and deployment → Source**: "Deploy from a
branch", branch `main`, folder `/ (root)`.

### 2. Create a Smartsheet API access token

In Smartsheet: click your account avatar → **Apps & Integrations** →
**API Access** → **Generate new access token**. Copy it immediately - it's
only shown once.

### 3. Get the Sheet ID

Open the sheet in Smartsheet → **File → Properties** (or right-click the
sheet's tab/name → **Properties**) and copy the **Sheet ID**.

### 4. Add repo secrets

Repo **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `SMARTSHEET_ACCESS_TOKEN` | the token from step 2 |
| `SMARTSHEET_SHEET_ID` | the sheet ID from step 3 |

### 5. Match the column mapping to your sheet

[`config/smartsheet-map.json`](config/smartsheet-map.json) currently assumes
these column titles:

```json
{
  "task": "Task / Deliverable",
  "category": "",
  "responsible": "Responsible",
  "accountable": "Accountable",
  "consulted": "Consulted",
  "informed": "Informed",
  "status": "Status",
  "dueDate": "Due Date"
}
```

A field can be:
- a single column title,
- an array of titles (joined together), or
- `""` if you don't have that column - it's simply omitted instead of
  showing a misleading blank.

Edit this file to match your sheet's actual column titles (case-sensitive)
once you have the sheet ID and token. Pushing a change to it automatically
triggers a data refresh.

Status text drives the colored pill in the table (see `statusSlug()` in
`app.js`):

- Contains "complete"/"completed"/"done" → green
- Contains "blocked"/"at risk"/"delayed"/"stuck" → red
- Contains "in progress"/"active"/"ongoing"/"underway" → blue
- Anything else (including blank) → gray "Not Started"

If your "Status" picklist uses different wording, add it to the matching
word list near the top of `app.js`.

### 6. Run the sync once

Repo **Actions** tab → **Update Matrix Data** → **Run workflow**. After it
finishes, `data/matrix-data.json` will have your real data, and the Pages
site will pick it up automatically. After that, it runs every 30 minutes -
adjust the cron schedule in
[`.github/workflows/update-data.yml`](.github/workflows/update-data.yml) if
you want it more or less frequent.

## Local development

```bash
npm install --no-save   # no dependencies currently, but future-proofs the step
node scripts/fetch-smartsheet.js   # requires SMARTSHEET_ACCESS_TOKEN / SMARTSHEET_SHEET_ID env vars
python -m http.server 8000         # or any static file server
# open http://localhost:8000
```

## Data shape

`data/matrix-data.json`:

```json
{
  "generatedAt": "2026-09-17T00:00:00Z",
  "source": "smartsheet",
  "sheetName": "Accountability Matrix",
  "items": [
    {
      "id": "1",
      "task": "Finalize vessel charter agreement",
      "category": "Commercial",
      "responsible": "Jane Doe",
      "accountable": "John Smith",
      "consulted": "Legal Team",
      "informed": "Finance",
      "status": "In Progress",
      "dueDate": "2026-09-30",
      "link": "https://app.smartsheet.com/sheets/...?rowId=..."
    }
  ]
}
```

`link` is the row's Smartsheet permalink, fetched in bulk via
`?include=rowPermalink` on the sheet request - no extra API call per row.
