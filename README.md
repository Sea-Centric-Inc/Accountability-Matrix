# Accountability Matrix

An RFP/proposal accountability + pipeline tracker, pulled from a Smartsheet
and displayed as a static site - same pipeline as the
[Marine Ops Schedule](https://github.com/Sea-Centric-Inc/Marine-Ops.-Schedule)
site.

Each row with an RFP Title is a proposal. The sheet tracks three things per
proposal:

1. **Which departments are accountable for it** (Human Resources,
   Operations, HSEQ, Business Development, IT, Finance, Other) - this is the
   actual "matrix" part: proposals x departments.
2. **A 6-stage review pipeline** (Kick-Off Meeting → Compliance Review →
   Draft Review → Final Review → Executive Approval → Submission), each stage
   with a planned date and an actual date.
3. **Deliverables** - rows with Item No. / Description / Document / Ref Link
   / Owner / Due Date / Status / Complete?. Each deliverable attaches to the
   proposal named in its **RFP Title Confirmation** cell (or the row's own
   RFP Title if that's blank). Deliverables that don't match any proposal
   are listed in a "not linked to an RFP" panel so they can be fixed.

The site reads the **refined** sheet (`5706430201155460`). The original
sheet (`5358166513504132`, 8 stages, no deliverables) is no longer used.

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

The sheet ID lives in `config/smartsheet-map.json` (`"sheetId"`), so
switching sheets is a config change, not a secret change. The
`SMARTSHEET_SHEET_ID` secret is only used as a fallback if that key is
removed.

## Features

- **Proposal table** - one row per RFP: title/number (linked to the
  Smartsheet row), client, proposal lead, accountable departments (as
  chips - `Department: assigned person`, or just the department name if the
  cell only holds a checkmark), submission deadline, a 6-dot pipeline
  stepper, and an overall status pill.
- **Deliverables column** - "N of M done", plus a red "N overdue" line when
  any deliverable is past its Due Date without Complete? ticked or a Closed
  status. The Details panel lists each deliverable with its owner, due date,
  document link and status.
- **Pipeline stepper** - one dot per stage, colored by that stage's own
  state: green = done on time, gold = done late (actual after planned), red
  = overdue (planned date has passed with no actual date yet), gray =
  pending. Hover a dot for the stage name and both dates.
- **Details** - every row has a "Details" toggle that expands to show every
  remaining column that doesn't fit in the compact table view: Submission
  Method, Reference Documentation (rendered as a link if it's a URL or a
  Smartsheet hyperlink), the full 6-stage table with Planned/Actual dates
  and a status label per stage, and the deliverables table. Nothing in the sheet is hidden - everything either shows in the
  table or in this expanded panel.
- **New RFP Entry / New Item Entry** - header buttons open the sheet's two
  Smartsheet forms in a new tab: the general entry form
  (`01a19d039c827073a527ce22630846d7`) adds a proposal, and the item entry
  form (`01a19d03a0f175189a6d008388b3a56e`) adds a deliverable. Both write
  to the same sheet this site reads from. Edit the `href`s in `index.html`
  if the form URLs ever change.
- **Overall status** (derived, see `itemStatus()` in `app.js`):
  - **Submitted** - the final "Submission" stage has an actual date.
  - **At Risk** - any stage or deliverable is overdue.
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
| `SMARTSHEET_SHEET_ID` | optional fallback - the sheet ID normally comes from `config/smartsheet-map.json` |

The token must belong to a Smartsheet user who can view the sheet in
`config/smartsheet-map.json`.

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
