# Accountability Matrix

An RFP/proposal accountability + pipeline tracker, pulled from a Smartsheet
and displayed as a static site - same pipeline as the
[Marine Ops Schedule](https://github.com/Sea-Centric-Inc/Marine-Ops.-Schedule)
site.

Each row in the sheet is a proposal. The sheet tracks two things per
proposal:

1. **Which departments are accountable for it** (Human Resources,
   Operations, HSEQ, Business Development, IT, Finance, Other) - this is the
   actual "matrix" part: proposals x departments.
2. **An 8-stage review pipeline** (Kick-Off Meeting → Compliance Review →
   Technical Review → Commercial Review → Draft Review → Final Review →
   Executive Approval → Submission), each stage with a planned date and an
   actual date.

## How it works

```
Smartsheet  --(GitHub Action, every 30 min)-->  data/matrix-data.json  --> index.html (GitHub Pages)
```

- `scripts/fetch-smartsheet.js` calls the Smartsheet API and writes the
  result to `data/matrix-data.json`.
- `.github/workflows/update-data.yml` runs that script on a schedule (and on
  demand) using a token stored as a GitHub secret, then commits the updated
  JSON file. **The Smartsheet token never reaches the browser** - only the
  already-fetched data does.
- `index.html` / `app.js` / `style.css` are a plain static site (no build
  step) that reads `data/matrix-data.json` and renders the table.

Right now `data/matrix-data.json` contains sample data so you can see the
page working immediately. The live Smartsheet (`Accountability Matrix`,
sheet ID `5358166513504132`) currently has 5 blank rows - once real
proposals are added there, running the sync will overwrite the sample data.

## Features

- **Proposal table** - one row per RFP: title/number (linked to the
  Smartsheet row), client, proposal lead, accountable departments (as
  chips - `Department: assigned person`, or just the department name if the
  cell only holds a checkmark), submission deadline, an 8-dot pipeline
  stepper, and an overall status pill.
- **Pipeline stepper** - one dot per stage, colored by that stage's own
  state: green = done on time, gold = done late (actual after planned), red
  = overdue (planned date has passed with no actual date yet), gray =
  pending. Hover a dot for the stage name and both dates.
- **Details** - every row has a "Details" toggle that expands to show every
  remaining column that doesn't fit in the compact table view: Submission
  Method, Reference Documentation (rendered as a link if it's a URL), and
  the full 8-stage table with Planned/Actual dates and a status label per
  stage. Nothing in the sheet is hidden - everything either shows in the
  table or in this expanded panel.
- **New RFP Entry** (not wired up yet) - there's no published Smartsheet
  form for this sheet yet. Once one exists (sheet → **Forms** → **Create
  Form**, mapped to the same columns as `config/smartsheet-map.json`), add a
  header button back in `index.html`:
  ```html
  <a href="<form URL>" target="_blank" rel="noopener noreferrer" class="text-button no-print">New RFP Entry</a>
  ```
  right after the `#generated-at` span.
- **Overall status** (derived, see `itemStatus()` in `app.js`):
  - **Submitted** - the final "Submission" stage has an actual date.
  - **At Risk** - any stage is overdue.
  - **In Progress** - at least one stage has an actual date, none overdue.
  - **Not Started** - no stage has an actual date yet.
- **Search, status filter, department filter, hide-submitted** - the
  toolbar; search matches title, number, client, lead, submission method,
  and department names/assignees.
- **By Department** - pick a department, see every proposal it's on the
  hook for, counts by status, and those rows highlighted in the table below.
- **Shareable links** - search, filters, and the selected department are
  kept in the URL.
- **Print / Export PDF** - button in the header.

## Restricting access to seacentric.ca accounts (Azure Static Web Apps)

Same approach as the Marine Ops site:
[`staticwebapp.config.json`](staticwebapp.config.json) requires Microsoft
Entra ID (Azure AD) sign-in on every route. It has no effect on GitHub Pages
- if you enable GitHub Pages for this repo, disable it once Azure is the
deployment you actually want people using. See the Marine Ops README's
"Restricting access" section for the full app registration walkthrough - the
steps are identical, just point the redirect URI at this app's hostname.

## One-time setup

### 1. Enable GitHub Pages (or Azure Static Web Apps)

Repo **Settings → Pages → Build and deployment → Source**: "Deploy from a
branch", branch `main`, folder `/ (root)`.

### 2. Add repo secrets

Repo **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `SMARTSHEET_ACCESS_TOKEN` | a Smartsheet API access token (Smartsheet → avatar → Apps & Integrations → API Access) |
| `SMARTSHEET_SHEET_ID` | `5358166513504132` |

**Not set automatically** - `gh` CLI wasn't available when this repo was set
up, so these two secrets need to be added through the GitHub UI by someone
with write access to the repo.

### 3. Column mapping

[`config/smartsheet-map.json`](config/smartsheet-map.json) already matches
the real sheet's columns (confirmed directly against the Smartsheet API):

```json
{
  "title": "RFP Title",
  "number": "RFP Number",
  "client": "Client / Organization",
  "lead": "Proposal Manager / Lead",
  "submissionMethod": "Submission Method",
  "submissionDeadline": "Submission Deadline",
  "referenceDocs": "Reference Documentation",
  "departments": {
    "Human Resources": "Human Resources",
    "Operations": "Operations",
    "HSEQ": "HSEQ",
    "Business Development": "Business Development",
    "IT": "IT",
    "Finance": "Finance",
    "Other": "Other"
  },
  "stages": [
    { "label": "Kick-Off Meeting", "planned": "Kick-Off Meeting Planned Date", "actual": "Kick-Off Meeting Actual Date" },
    ...
  ]
}
```

A department cell counts as "involved" whenever it has any value at all
(checkmark, name, anything non-blank). If you rename or add columns later,
edit this file and commit to `main` - pushing a change to it automatically
triggers a data refresh (see workflow triggers in
[`.github/workflows/update-data.yml`](.github/workflows/update-data.yml)).

### 4. Run the sync once

Repo **Actions** tab → **Update Matrix Data** → **Run workflow**. After it
finishes, `data/matrix-data.json` will have your real proposals, and the
Pages site will pick it up automatically. After that, it runs every 30
minutes.

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
      "title": "Offshore Supply Vessel Charter",
      "number": "RFP-2026-014",
      "client": "Atlantic Energy Partners",
      "lead": "Jane Doe",
      "submissionMethod": "Client Portal",
      "submissionDeadline": "2026-10-10",
      "referenceDocs": "",
      "departments": { "Operations": "Mike Chen", "HSEQ": "Sarah Lee" },
      "stages": [
        { "label": "Kick-Off Meeting", "planned": "2026-08-20", "actual": "2026-08-20" }
      ],
      "link": "https://app.smartsheet.com/sheets/...?rowId=..."
    }
  ]
}
```

`link` is the row's Smartsheet permalink, fetched in bulk via
`?include=rowPermalink` on the sheet request - no extra API call per row.
