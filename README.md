# Net Worth

A private dashboard and editor for a personal net-worth Google Sheet, built with React, TypeScript and Vite. It runs entirely in your browser and is published to GitHub Pages by GitHub Actions.

**The sheet stays the source of truth.** The app reads and writes it through the Google Sheets API, signed in as you. This repository and the published site contain code only, never data.

- Dashboard: totals, net worth trend, month-on-month change, and allocation by category, location and holder
- Every Net Worth line drills into the holdings behind it
- Edit holdings, balances, NPS and FX rates
- Add mutual funds, fixed deposits, UAE gold and silver purchases, and monthly snapshots
- Every write goes through a review screen listing the exact cells, before → after
- Live checks for stale valuations, matured FDs, drifting totals and out-of-step ledgers
- Phone-friendly: tables become cards, and holdings are collapsible sections

---

## How your data is protected

The site is public. Your data is not. Anyone can load the page and read its JavaScript, so **no check inside the page is a security boundary**. The protection comes from Google, which checks every request before any data leaves its servers:

| Layer | Enforced by | What it stops |
|---|---|---|
| OAuth app in **Testing** mode, with only your accounts as test users | Google sign-in | Any other Google account is refused at sign-in |
| **`drive.file`** scope + Google Picker | Google Drive | The app can open only the one sheet you picked, nothing else in your Drive |
| The sheet's **sharing settings** | Google Sheets API | A token for an account without access gets `403`; a **Viewer** can't write |

Also:

- **Token in memory only.** It is never written to localStorage or cookies. Reloading the tab signs you out, and the app locks itself after 20 idle minutes.
- **No spreadsheet data in git or in the build.** Configuration lives in `.env.local` and GitHub repository variables, never in the code. A pre-commit hook blocks data files, `.env.local`, hardcoded email addresses, sheet URLs and OAuth client secrets, and the deploy workflow checks the built site carries no data.
- **Strict Content-Security-Policy** in production. Only this site's scripts and Google's sign-in and Picker libraries can run, and only Google APIs can be contacted. There are no inline scripts and no `eval`.
- **Escaped output.** React escapes every value read from the sheet, so a cell can't inject code.
- **Safe writes.** Before writing, the app re-reads the sheet, finds each target row by its content rather than its row number, and checks the value is still what you reviewed. If anything changed, nothing is written. All changes in one save go out as a single atomic `batchUpdate`.

**Everything in `VITE_*` is public.** Vite copies those values into the JavaScript it publishes, so treat the whole file as readable by anyone who opens the site — including the configured email addresses. That's safe for what's there: browser apps use no client secret, Google only accepts sign-ins from the *Authorized JavaScript origins* you register, the API key is restricted to your site and the Picker API, and the email lists decide nothing about who can reach your data.

**The honest limit:** the app is only as safe as your Google account and your unlocked devices, so use 2-step verification.

**Revoke access anytime:** in the app, open ⋯ → *Revoke Google access*, or visit [myaccount.google.com/connections](https://myaccount.google.com/connections).

### Who can view and who can edit

| To let someone… | Do this |
|---|---|
| Sign in at all | Add them as a **test user** (Google Auth Platform → Audience) |
| See the data | **Share the sheet** with them in Google Sheets |
| Only view, not write | Share as **Viewer**, which Google enforces, and leave them out of `VITE_EDITOR_EMAILS`, which hides the Edit buttons |

`VITE_ALLOWED_EMAILS` is optional. It only replaces Google's refusal with a friendlier message, so leaving it empty is perfectly fine.

---

## Setup

About 20 minutes, once. Replace `USERNAME` with your GitHub username throughout.

### 1. Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com) → project picker → **New project**. No billing account is needed.
2. **APIs & Services → Library**, and enable **Google Sheets API**, **Google Picker API** and **Google Drive API**.
3. Note the **project number** on the project dashboard. It's the long number, not the project ID.

### 2. OAuth consent (Google Auth Platform)

1. **Branding**: app name `Net Worth`, your email as support and developer contact.
2. **Audience**: user type **External**, publishing status **Testing**. Under **Test users**, add every Google account that should be able to sign in.
3. **Data Access**: add the scopes `.../auth/drive.file`, `openid` and `.../auth/userinfo.email`. All three are non-sensitive, so Google won't ask for a review.

Keep the app in **Testing**: the test-user list is a gate that Google enforces.

### 3. Credentials

**Google Auth Platform → Clients → Create client**

- Application type: **Web application**
- Name: anything, e.g. `Net Worth web app`. Only you see it.
- Authorized JavaScript origins (click **+ Add URI** for each):
  - `https://USERNAME.github.io` (lowercase)
  - `http://localhost:8080` (local development)

  Enter the origin only: no path and no trailing `/`.
- Leave *Authorized redirect URIs* empty, click **Create**, and copy the **Client ID**.
- Ignore any client secret (`GOCSPX-…`). The app never uses one.
- New origins can take from 5 minutes to a few hours to start working.

**APIs & Services → Credentials → Create credentials → API key**

- API restrictions: **Restrict key** → **Google Picker API**
- Application restrictions: **Websites** → `https://USERNAME.github.io/*` and `http://localhost:8080/*`

### 4. Local configuration

```bash
cp .env.example .env.local
```

Fill in `.env.local` with the client ID, API key and project number. `VITE_ALLOWED_EMAILS` and `VITE_EDITOR_EMAILS` take comma-separated addresses:

```
VITE_ALLOWED_EMAILS=you@gmail.com,partner@example.com
VITE_EDITOR_EMAILS=you@gmail.com
```

### 5. GitHub

1. Create an empty repository named `networth-tracker`. Public is fine, since the repo contains no data.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables tab → New repository variable**, once for each value from your `.env.local`:

   | Variable | Required |
   |---|---|
   | `VITE_GOOGLE_CLIENT_ID` | yes |
   | `VITE_GOOGLE_API_KEY` | yes |
   | `VITE_GOOGLE_APP_ID` | yes |
   | `VITE_ALLOWED_EMAILS` | no |
   | `VITE_EDITOR_EMAILS` | no |
   | `VITE_IDLE_MINUTES` | no (default 20) |

4. Push:

   ```bash
   git remote add origin https://github.com/USERNAME/networth-tracker.git
   ```

   ```bash
   git push -u origin main
   ```

Every push to `main` builds, tests and deploys. The site appears at `https://USERNAME.github.io/networth-tracker/`. To change who has access, edit the variables and re-run the workflow (**Actions → Deploy to GitHub Pages → Run workflow**); no code change is needed.

### 6. First run

Open the site → **Sign in with Google** → **Choose from Google Drive** → pick your sheet. That browser remembers the choice.

---

## Development

Requires Node 22.12 or newer.

```bash
npm install
```

```bash
git config core.hooksPath tools/hooks
```

```bash
npm run dev
```

Open **http://localhost:8080**, using `localhost` rather than `127.0.0.1`, because the OAuth origin must match exactly.

### Demo mode

Runs the whole app against a local copy of your sheet, with no Google involved. It is available in development only and is compiled out of production builds.

```bash
pip3 install openpyxl
```

```bash
npm run fixture -- ~/Downloads/NetworthTracker.xlsx
```

Then open http://localhost:8080/?demo, or http://localhost:8080/?demo&viewer to see the read-only view. Writes change an in-memory copy only; reload to reset.

The fixture (`demo/fixture.json`) holds your real data. It is gitignored and blocked by the hook. The dev server serves it at a private path, and it never goes into `public/`, because Vite would publish anything placed there.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on http://localhost:8080 |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serve the production build locally (CSP on) |
| `npm test` | Unit and render tests (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run fixture -- <xlsx>` | Build the local demo fixture |

### Keeping your data out of the repo

- `demo/`, `.env.local`, `dist/` and spreadsheet exports are gitignored.
- `tools/hooks/pre-commit` refuses them even when force-added, along with email addresses, Google Sheets URLs and OAuth client secrets.
- **Tests and docs must never contain figures, fund names or people's names from the sheet.** Derive expectations from the fixture at run time instead; `tests/core.test.ts` shows the pattern. The hook can't catch this one for you.

---

## How it works

### Reading the sheet

The app finds each table by its **header text**, not by fixed cell addresses, and identifies rows by their content (e.g. fund + holder). Rearranging a tab or inserting rows by hand doesn't break it; renaming a header does. The expected headers are in `SPECS` in `src/lib/model.ts`.

Each Net Worth line drills into its holdings by following its own formula. For example, `=Receivables!$C$14` points at a family-loan row, and that row's *Detail Sheet* column names the ledger tab to open. No tab or person names are hardcoded.

**Totals are computed by the sheet, never by the app.** Section totals use `=SUM(INDIRECT("F5:F"&ROW()-1))`, which always sums down to the row just above the total, so rows the app inserts directly under the last row are counted automatically.

### What the app writes

| Action | Cells |
|---|---|
| Edit a fund, equity account, SGB, FD or bank balance | The edited cells, plus the valuation date |
| Add a fund or FD | A new row under the last one. Formula columns are copied from the row above; other columns are left blank |
| Add a UAE gold or silver purchase | A new row, and the summary's *Invested* and *Quantity* cells become `SUM` formulas |
| Add a monthly snapshot | A new row in *Monthly Trend*, with its helper formulas copied from the row above |
| Link a family loan to its ledger | The loan's balance in Receivables becomes a formula pointing at the ledger's Net Balance |
| FX, NPS, gold value, silver price | That single cell |

Not in the app yet (do these in the sheet): adding equity accounts, SGB tranches or bank accounts, editing ledger entries, and closing FDs.

### Project layout

```
src/
  main.tsx, App.tsx          entry point and screen flow
  config.ts                  build-time configuration (VITE_* variables)
  hooks/                     useSession (sign-in → pick → load → write), idle lock, element width
  components/
    dashboard/               tiles, positions, holdings, rates, checks, allocation
    charts/                  SVG trend and month-on-month charts
    EditorDialog.tsx         form → review → write
    Header.tsx, Screens.tsx, Toast.tsx, ui.tsx
  lib/                       no React: the tested core
    model.ts                 finds tables by header, reads rows by content key
    writer.ts                write plans, conflict checks, atomic batchUpdate
    editors.ts               what each dialog asks, and the plan it produces
    checks.ts, links.ts      "Worth a look" rules; Net Worth → holdings links
    sheets.ts, demoSheets.ts Google Sheets client; in-memory dev backend
    auth.ts, picker.ts       Google sign-in (token in memory) and Picker
    access.ts, format.ts     who may view/edit; money, date and A1 helpers
  styles/app.css             colour-blind-safe palette, light and dark
tests/                       Vitest; most tests need the local fixture
apps-script/NavFeed.gs       daily AMFI NAVs, runs inside the sheet
apps-script/RatesFeed.gs     daily 22C gold and AED → INR rates
apps-script/EtoroFeed.gs     daily eToro positions (read-only API key)
tools/                       fixture builder, git hooks
.github/workflows/deploy.yml build, test, check and publish
```

---

## Automations inside the sheet

These run in Google Sheets itself, not in the app.

### Live AED → INR rate

In the app, open *Rates & other inputs* → **AED → INR** → *Live rate from Google Finance*. It writes `=GOOGLEFINANCE("CURRENCY:USDINR")/3.6725`. AED is pegged to USD at 3.6725, so this tracks the market with no upkeep. Quotes can be up to 20 minutes old.

### Daily gold and AED rates

`IMPORTXML` and `GOOGLEFINANCE` formulas only refresh reliably while the sheet is open, and the web app reads the last saved values. `apps-script/RatesFeed.gs` fetches the rates on a schedule instead, into a `Rates Feed` tab:

| Rate | Source |
|---|---|
| Gold 22C (₹/g) | Gulf News, India gold prices (the day's 22 Carat rate) |
| AED → INR | Google Finance USD → INR ÷ 3.6725 (the AED peg) |

1. In **Extensions → Apps Script**, add a script file, paste `RatesFeed.gs` in, and also paste the updated `NavFeed.gs` (it adds the menu items). Save and reload the sheet.
2. **Net Worth** menu → **Refresh gold & AED rates now**. The first run asks you to approve fetching from the web.
3. **Net Worth** → **Refresh rates daily (11am IST)**.
4. Point the cells at the feed: the gold rate cell `=VLOOKUP("Gold 22C (₹/g)",'Rates Feed'!A:B,2,FALSE)` and the AED → INR cell `=VLOOKUP("AED → INR",'Rates Feed'!A:B,2,FALSE)`.

The app then shows each rate's date, and *Worth a look* flags the feed if it hasn't refreshed for three days. A failed fetch keeps the previous value.

### Daily eToro portfolio

`apps-script/EtoroFeed.gs` reads your real eToro portfolio through eToro's public API into an `eToro Feed` tab: one row per instrument (symbol, name, type, units, invested, value, P&L in USD), one per copy-trading portfolio, pending orders, cash, and a **Total** row. Value is eToro's own figure, amount invested plus its unrealised P&L.

1. In eToro: **Settings → Trading → API Key Management → Create New Key**, environment **Real**, permission **Read** (it can see the portfolio but never trade). You also need the public API key from the [eToro API portal](https://api-portal.etoro.com/). Your account must be verified for the option to appear.
2. In **Extensions → Apps Script**, add a script file, paste `EtoroFeed.gs`, and paste the updated `NavFeed.gs` (it adds the menu items). Save and reload the sheet.
3. **Net Worth → Set eToro keys** and paste both. They are kept in the script's user properties, private to your Google account: never in the sheet, this repo or the web app.
4. **Net Worth → Refresh eToro now**, then **Refresh eToro daily (7am IST)**.
5. Point the eToro line's *Current (Local)* on the Equity tab at the feed: `=VLOOKUP("Total",'eToro Feed'!A:F,6,FALSE)`.

The app lists each holding under Holdings → Investments → eToro, and *Worth a look* flags the feed if it hasn't refreshed for three days.

### Daily mutual fund NAVs

`apps-script/NavFeed.gs` pulls AMFI's official daily NAV file into a `NAV Feed` tab, a plain price list (code, NAV, NAV date, scheme name) that it rewrites on every refresh.

What you hold lives on the **Mutual Funds** tab, in two columns after NAV Date: **AMFI code** (from [NAVAll.txt](https://www.amfiindia.com/spages/NAVAll.txt)) and **Units** (from your CAS statement). Each fund's *Current* is `units × VLOOKUP(code, 'NAV Feed'!A:C, 2)` and its *NAV Date* is `VLOOKUP(code, 'NAV Feed'!A:C, 3)`. The script prices every code it finds there, so a new fund needs only its code and units.

1. In the sheet: **Extensions → Apps Script**, paste the file in and save, then reload the sheet.
2. **Net Worth → Refresh NAVs now**, then **Refresh NAVs daily (7am IST)**.

In the app, editing a fund then asks for units, invested amount and scheme code; its value follows from the NAV. Check each code's plan (Direct/Regular) and option (Growth/IDCW); NAV Feed's scheme-name column shows AMFI's full name so you can confirm.
