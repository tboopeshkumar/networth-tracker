# Net Worth

A private dashboard and editor for a personal net-worth Google Sheet. It is a static site (plain HTML and JavaScript modules, no build step) that runs entirely in your browser.

**The sheet stays the source of truth.** The app reads and writes it through the Google Sheets API, signed in as you. This repository and the website contain code only, never data.

- Dashboard: totals, net worth trend, month-on-month change, allocation by category, location and holder
- Edit existing holdings, balances, NPS and FX rates
- Add mutual funds, fixed deposits, UAE gold and silver purchases, and monthly snapshots
- Every write goes through a review screen listing the exact cells, before → after
- Live checks for stale valuations, matured FDs and totals that drift from their rows

---

## How your data is protected

The site is public. Your data is not. Anyone can load the page and read the code, so **no check inside the page is a security boundary**. The protection comes from Google, which checks every request before any data leaves its servers:

| Layer | Enforced by | What it stops |
|---|---|---|
| OAuth app in **Testing** mode, with only your accounts as test users | Google sign-in | Any other Google account is refused at sign-in |
| **`drive.file`** scope + Google Picker | Google Drive | The app can open only the one sheet you picked, nothing else in your Drive |
| The sheet's **sharing settings** | Google Sheets API | A token for an account without access gets `403` |

Also:

- **Token in memory only.** It is never written to localStorage or cookies. Closing the tab signs you out, and the app locks itself after 20 idle minutes (`idleMinutes` in `js/config.js`).
- **Nothing sensitive in git.** The client ID and API key are public by design (see below), the sheet ID stays in your browser's storage, and a pre-commit hook blocks data files.
- **Strict Content-Security-Policy.** Only this site's scripts and Google's sign-in and Picker libraries can run, and only Google APIs can be contacted. There are no inline scripts and no `eval`.
- **Escaped output.** Every value read from the sheet is escaped before it touches the page, so a cell can't inject code.
- **Safe writes.** Before writing, the app re-reads the sheet, finds each target row by its content rather than its row number, and checks the value is still what you reviewed. If anything changed, nothing is written. All changes in one save go out as a single atomic `batchUpdate`.

### Letting someone view but not edit

Two settings, and only one of them actually enforces anything:

1. **The real gate — share the sheet as Viewer.** In Google Sheets → Share, give them **Viewer**, not Editor. Google then refuses their writes with a `403`, whatever the app does. Add them as a **test user** too, or they can't sign in at all.
2. **The UI — `editors` in `js/config.js`.** List the accounts that should see Edit and Add buttons. Everyone else gets a clean read-only dashboard with a *View only* badge. Leave the list empty and every account that can sign in may edit.

`editors` is presentation, not protection: page code can be edited in the browser, and anyone signed in can call the Sheets API directly. Never rely on it alone — set the sharing level as well.

Preview the read-only view locally with `http://localhost:8080/?demo&viewer`.

**Why a public client ID is fine:** browser apps use no client secret. Google only accepts sign-ins that start from the *Authorized JavaScript origins* you register, so someone who copies your client ID onto their own site gets rejected.

**The honest limit:** the app is as safe as your Google account and your unlocked devices. Use 2-step verification.

**Revoke access anytime:** in the app, open ⋯ → *Revoke Google access*, or visit [myaccount.google.com/connections](https://myaccount.google.com/connections).

---

## Setup

About 20 minutes, once. Replace `USERNAME` with your GitHub username throughout.

### 1. Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com) → project picker → **New project**, named e.g. `networth`. No billing account is needed.
2. **APIs & Services → Library**, and enable:
   - **Google Sheets API**
   - **Google Picker API**
   - **Google Drive API** (the Picker relies on it; enabling an API grants no access by itself)
3. Note the **project number** on the project dashboard (*Project info* card). It's a long number, *not* the project ID.

### 2. OAuth consent (Google Auth Platform)

In **Google Auth Platform** (older consoles call it *OAuth consent screen*):

1. **Branding**: app name `Net Worth`, your email as support and developer contact.
2. **Audience**: user type **External**, publishing status **Testing**.
   Under **Test users**, add your Google account, plus anyone else who should use it (e.g. your spouse, who also needs the sheet shared with them). **Only these accounts will be able to sign in.**
3. **Data Access** → *Add or remove scopes*, and add:
   - `.../auth/drive.file`
   - `openid`
   - `.../auth/userinfo.email`

   All three are *non-sensitive* scopes, so Google won't ask for a security review.

> **Keep it in Testing.** The test-user list is a real gate enforced by Google. Moving to *In production* removes it. Your data would still be protected by `drive.file` and the sheet's sharing, but anyone could complete sign-in. If you find yourself re-approving access more often than you'd like, that's a side effect of Testing mode; it's a trade-off you can revisit later.

### 3. Credentials

**Google Auth Platform → Clients → Create client**

- Application type: **Web application**
- Name: anything, e.g. `Net Worth web app`. Only you see it, in the console; the sign-in screen shows the Branding app name.
- Authorized JavaScript origins (click **+ Add URI** for each):
  - `https://USERNAME.github.io`, where `USERNAME` is your GitHub username (from `github.com/USERNAME`) in lowercase
  - `http://localhost:8080` (for trying real sign-in locally)

  Enter the origin only: no path (not `/networth-tracker/`) and no trailing `/`.
- Leave *Authorized redirect URIs* empty. Sign-in uses a popup, so there is no redirect.
- Click **Create** and copy the **Client ID** (ends in `.apps.googleusercontent.com`).
- If a **client secret** (`GOCSPX-…`) is shown, ignore it. This app never uses one, and it must not go in the repo (the pre-commit hook blocks it).
- New origins can take from 5 minutes to a few hours to start working. An early `origin_mismatch` error is usually just that delay.

**APIs & Services → Credentials → Create credentials → API key**, then *Edit API key*:

- Application restrictions → **Websites**: `https://USERNAME.github.io/*` and `http://localhost:8080/*`
- API restrictions → **Restrict key** → **Google Picker API** only

### 4. Configure

Edit `js/config.js`:

```js
export const CONFIG = {
  clientId: '1234567890-abc123.apps.googleusercontent.com',
  apiKey: 'AIza...',
  appId: '1234567890',              // project NUMBER
  allowedEmails: ['you@gmail.com'], // friendly message for anyone else; not a security boundary
  idleMinutes: 20,
};
```

All four values are safe to commit.

### 5. Publish on GitHub Pages

```bash
git config core.hooksPath tools/hooks
```

```bash
git add -A && git commit -m "Net worth app"
```

```bash
git remote add origin https://github.com/USERNAME/networth-tracker.git
```

```bash
git push -u origin main
```

On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save.** The site appears at `https://USERNAME.github.io/networth-tracker/` within a minute or two.

### 6. First run

Open the site → **Sign in with Google** → **Choose from Google Drive** → pick your sheet. The choice is remembered in that browser. On another device you'll pick the sheet once more.

---

## Local development

Demo mode runs the full app against a local copy of your sheet, with no Google involved. It only works on `localhost`.

```bash
pip3 install openpyxl
```

```bash
python3 tools/make_fixture.py ~/Downloads/NetworthTracker.xlsx
```

```bash
npm run serve
```

Then open http://localhost:8080/?demo. Writes in demo mode change an in-memory copy only; reload to reset. Only simple arithmetic formulas are recalculated in the demo, whereas the real sheet recalculates everything.

```bash
npm test
```

The tests need the fixture, so they skip on machines that don't have it.

### Keeping your data out of the repo

- `demo/`, spreadsheet exports and the old prototype are in `.gitignore`.
- `tools/hooks/pre-commit` refuses data files, Google Sheets URLs and OAuth client secrets, even if force-added. Enable it with `git config core.hooksPath tools/hooks` in every clone.
- **Tests and docs must never contain figures, fund names or people's names from the sheet.** Derive expectations from the fixture at run time instead; `tests/core.test.mjs` shows the pattern. The hook can't catch this one for you.

---

## How the sheet is read

The app finds each table by its **header text**, not by fixed cell addresses, and identifies rows by their content (e.g. fund + holder). Rearranging a tab, or inserting rows by hand, doesn't break it. Renaming a header does. The expected headers are listed in `SPECS` in `js/model.js`.

Tabs used: `Net Worth`, `Monthly Trend`, `Mutual Funds`, `Equity`, `Gold (India SGB)`, `Fixed Deposits`, `Bank Balances`, `Gold (UAE)`, `Silver (UAE)`, `NPS`.

**Totals are computed by the sheet, never by the app.** Section totals use `=SUM(INDIRECT("F5:F"&ROW()-1))`, which always sums down to the row just above the total. New rows are inserted directly under the last row, so they're counted automatically.

### What the app writes

| Action | Cells |
|---|---|
| Edit a fund, equity account, SGB, FD or bank balance | The edited cells, plus the valuation date |
| Add a fund or FD | A new row under the last one. Formula columns (e.g. P&L) are copied from the row above; other columns are left blank |
| Add a UAE gold or silver purchase | A new row, and the summary's *Invested* and *Quantity* cells become `SUM` formulas covering all purchases (they were typed numbers) |
| Add a monthly snapshot | A new row in *Monthly Trend*, with its helper formulas copied from the row above |
| FX, NPS, gold value, silver price | That single cell |

Not in the app yet (do these in the sheet): adding equity accounts, SGB tranches and bank accounts, and closing FDs. If one of your sheet's own charts stops at the previous month after a snapshot, extend its range once.

---

## Automations inside the sheet

These run in Google Sheets itself, not in the app.

### Live AED → INR rate

In the app, go to *Rates & other inputs* → **AED → INR** → *Live rate from Google Finance*. It writes:

```
=GOOGLEFINANCE("CURRENCY:USDINR")/3.6725
```

AED is pegged to USD at 3.6725, so this tracks the market with no upkeep. Google Finance quotes may be delayed by up to 20 minutes.

### Daily mutual fund NAVs

`apps-script/NavFeed.gs` pulls AMFI's official daily NAV file into a `NAV Feed` tab.

1. In the sheet: **Extensions → Apps Script**, paste the file in, and save. Reload the sheet.
2. A **Net Worth** menu appears. Choose **Set up NAV Feed tab**.
3. For each fund, fill in column A (the AMFI scheme code, searchable in [NAVAll.txt](https://www.amfiindia.com/spages/NAVAll.txt)), B (the fund name) and C (units held, from your CAS statement).
4. Choose **Refresh NAVs now**, then **Refresh NAVs daily (7am IST)**.

Column F becomes units × latest NAV. To make a fund's *Current* value update itself, point it at the feed:

```
=VLOOKUP(A5,'NAV Feed'!B:F,5,FALSE)
```

The script uses `@OnlyCurrentDoc`, so it can only access this one spreadsheet. Check that each code's *Plan* (Direct/Regular) and *Option* (Growth/IDCW) match what you actually hold; column G shows AMFI's full name so you can confirm.

---

## Project layout

```
index.html            page shell + Content-Security-Policy
css/app.css           styles (validated colour-blind-safe palette)
js/config.js          public config: client ID, API key, project number
js/auth.js            Google sign-in; token kept in memory only
js/picker.js          Google Picker; grants access to one file
js/sheets.js          Sheets API client + in-memory demo backend
js/model.js           finds tables by header, reads rows by content key
js/writer.js          write plans, conflict checks, atomic batchUpdate
js/dashboard.js       dashboard rendering
js/charts.js          SVG charts
js/edit.js            edit/add dialogs and the review screen
js/util.js            escaping, formatting, dates
apps-script/          NAV feed that runs inside the sheet
tools/                fixture builder, dev server, git hooks
tests/                node tests (need a local fixture)
```
