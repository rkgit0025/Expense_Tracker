# Changes — 20 July 2026 update

## Fresh start — 28 July 2026

Per request: starting clean from this codebase as the new baseline. Everything below this point in
the file is historical (from a previous round of work, including audit log timezone changes that
did not hold up in production) and is being set aside for now — this baseline does **not** include
any of that work. The only change made in this update is the one described right below.

### Added: Section 2 date-order validation (Daily Allowance)

Two new constraints on the date pickers in `Section2_DailyAllowance.jsx`, enforced the same way the
app already prevents future dates (native date-picker min/max, not a separate popup or error
message):

- **Return Journey** can no longer be dated before the latest Travel Days date — you can't return
  before you've traveled.
- **DA for Stay Days (Site Allowance)** must fall between the Travel date and the Return date (when
  a Return date has been entered) — site days only make sense between arriving and leaving.

Both bounds recompute live as Travel/Return dates are edited, and a small note appears under each
affected section explaining the current constraint. Boundary dates themselves are valid, selectable
values — e.g. a Stay date exactly matching the Return date is allowed, not rejected — matching how
overlapping boundary days are already meant to work in this form (billed once, not blocked).

Also fixed a small related gap found while implementing this: the Stay Days "From Date" field was
only ever capped at today's date and didn't respect the Return date as an upper bound the way "To
Date" already did — now both fields enforce the same window consistently.

**Scope of this change:** exactly one file touched —
`frontend/src/components/ExpenseForm/Section2_DailyAllowance.jsx`. Nothing else in this zip was
modified; verified with a full project diff against the uploaded baseline before packaging. A full
production build of the frontend was run against this exact codebase to confirm it compiles cleanly
with this change in place.

---

## Update — 22 July 2026 (Claim Amount Check tool + stale-data root cause)

Investigated the Rohit Raturi discrepancy (list showed ₹1,910, detail view correctly showed
₹3,503). Confirmed this is the same root cause as the earlier Manjot Singh case — **not** a new
bug, and **not** related to rejecting an expense (checked the reject route directly: it only ever
touches status/comment/reviewer fields, never `claim_amount`). This specific record's
`claim_amount` was calculated and saved before last update's fix went in, and — like any existing
record — never self-corrects just by being viewed. Verified this precisely: recreated the exact
scenario (a DA-only expense, then edited to add the same three travel legs) against the *current*
code, and it correctly recalculated to 3,503 on the edit. The fix works; old records just need to
be resaved or corrected once.

**Refactor:** the claim-total calculation used by the create and update routes has been extracted
into one shared function, `backend/config/claimCalc.js` (`computeClaimTotal`), so the two routes —
and the new tool below — can never drift out of sync with each other again the way `claim_amount`
and the on-screen summary once did.

**New: admin "Claim Amount Check" tool** (sidebar → Claim Amount Check, admin only). Two new
endpoints:
  - `GET /api/admin/claim-amount-check` — read-only, scans every expense and lists any whose
    stored `claim_amount` doesn't match what its actual Daily Allowance / Travel / Food / Hotel /
    Misc entries currently add up to. Never modifies anything.
  - `POST /api/admin/claim-amount-check/fix` — takes an explicit list of expense IDs (from the
    check above) and recalculates+saves the correct total for each, logging an audit entry.

Nothing is ever fixed automatically or silently — the check is read-only, and applying a fix
requires an explicit confirm click per expense or "Fix All" with a warning first.

**Tested against real data, not just the synthetic case:** running the check against the sample
database found **4 real pre-existing mismatches**, not just the one I was reproducing — confirming
this is worth a proper one-time sweep rather than fixing records as they're individually noticed.
Also verified: the check by itself never writes anything, the fix correctly recalculates and
saves, and an audit log entry is correctly recorded for every correction.

**Recommended next step:** run the check once via the new admin page to see the full scope, and
fix what it finds. Consider taking a database backup first (the Backup Database page from an
earlier update) since this does modify financial records, even though each change is a correction
back to the mathematically correct total.

---

## ⚠️ Security note (not a code issue, but important)
The zip you uploaded for this session included your actual `backend/.env` file with a live email
account password in plaintext. I did not use it or repeat it back anywhere, but it was transmitted
to me as part of the files. Please rotate that password, and avoid including `.env` in any future
exports — it's meant to stay only on your server.

---

## Update — 21 July 2026 (claim_amount under-counting travel entries)

Fixed the bug diagnosed in the previous session: the stored `claim_amount` (what the Expenses
list's Amount column shows) could silently exclude a travel entry's value, while the expense's own
detail/view page correctly included it — e.g. a real case showed 5,898 on the list vs. 7,098 on
the detail view, a gap of exactly the travel amount.

**Root cause:** travel entries carry two amount fields — `amount` (the rate typed in) and
`total_amount` (a computed field, added by a later migration). The `claim_amount` calculation in
`backend/routes/expenses.js` summed `total_amount` only, with no fallback. Every other place that
computes a travel total — the database insert logic (`insertTravel()`) and the on-screen Total
Claim Summary — already falls back to `amount` when `total_amount` is empty. `claim_amount` was
the one place that didn't, so a travel row whose `total_amount` hadn't been (re)computed in the
save that last touched it (e.g. a row loaded from an existing draft and not re-edited before
resubmitting) would correctly show its amount everywhere except in this one stored total.

**Fix:** added the same fallback (`total_amount ?? amount`) to the `claim_amount` calculation, in
both the create (`POST /`) and update (`PUT /:id`) routes — the two places this total is computed.
Verified two ways before shipping: a direct calculation test reproducing the exact reported numbers
(confirmed the old formula gives 5,898, the new one gives 7,098), and a full real HTTP
create-expense test through the actual server with a travel entry missing `total_amount` — the
saved `claim_amount` came back correctly as 7,098.00.

**Note on already-affected expenses:** this fixes the calculation for anything created or edited
going forward. It does **not** retroactively correct `claim_amount` on expenses already saved with
the old, under-counted total (like the one that surfaced this bug) — those would need either a
resave (open and save the expense again, which will now recompute it correctly) or a one-off data
correction script if there are many of them. Let me know if you want that.

---

## Update — 20 July 2026 (fifth follow-up: same-day duplicate entries in Single-Day Travel)

Investigated the report of a DEL→CDG / CDG→DEL same-day round trip (two entries in "DA for
Travel Days" for the same date, since Return is disabled in Single-Day Travel mode) being counted
as 2 days / double the amount.

**Result: this scenario was already handled correctly by the existing code.** I simulated the
exact sequence — select Single-Day Travel, fill Entry 1 (DEL→CDG, 1-Jul), add a second entry, fill
Entry 2 (CDG→DEL, same date 1-Jul) — using the real logic from `Section2_DailyAllowance.jsx`
directly (not just reasoning about it), and it correctly produces **1 day total**, with Entry 2
showing 0 days / ₹0 (its date was already claimed by Entry 1). I also checked every other place
that touches these totals (`TotalSummary.jsx`, the zero-amount validation in
`ExpenseFormPage.jsx`) — none of them recompute independently; they all just read the already-
deduplicated `total_amount` values, so there's no separate path where doubling could sneak back in.

This dedup logic has been in the code since the "Journey ↔ Return" overlap fix a few updates back
— **if you're still seeing double-counting, the most likely explanation is that the frontend
hasn't been rebuilt/redeployed since then** (backend-only changes were the focus of the last few
updates, which is easy to lose track of amid everything else). To rule this out on your end:
  1. Confirm you ran `npm run build` in `frontend/` after pulling this update, and that your
     server is serving the resulting `dist/` folder (not an older cached build).
  2. Hard-refresh the browser (or clear cache) when testing, since browsers can cache the old JS
     bundle by filename even after a redeploy.

This zip contains a completely fresh rebuild (`frontend/dist/` regenerated from scratch, verified
byte-identical output — confirming the source itself is unchanged and correct). If you redeploy
this and it's still doubling after a hard refresh, let me know and I'll treat it as a genuine
remaining bug and dig further rather than assuming a stale build.

---

## Update — 20 July 2026 (fourth follow-up: reverted the audit timestamp fix)

Per your request: audit logs were still not storing reliably even after the previous fix, so the
timezone changes to `backend/config/db.js` and `backend/config/audit.js` have been **reverted**
back to the original behavior:

- `db.js`: removed the `pool.on('connection', ...)` block that forced every connection's session
  to UTC.
- `audit.js`: restored `CONVERT_TZ(NOW(),'+00:00','+05:30')` in the `INSERT` statement.

This is the exact version that was reliably storing audit log rows before any of these timezone
changes — verified again just now (including under concurrent load) before shipping. The known
trade-off, as discussed, is that displayed audit log times will be off by a fixed +11 hours from
the real time (e.g. a 5:02 PM login shows as 4:02 AM the next day) — you mentioned this is
manageable to work around manually.

Everything else from the previous updates (Daily Allowance date-overlap fix, Single-Day Travel
To-Date auto-fill, the Department filter, the mobile-responsive grid fix, the corrected
`ADD COLUMN IF NOT EXISTS` migrations, download-all-attachments, and the database backup page) is
**unchanged** and unaffected by this revert.

If you ever want to revisit the timestamp display issue later — e.g. if you can confirm what
timezone your database server's OS is actually set to — let me know and we can take another run
at it with that information in hand, rather than guessing again.

---

## Update — 20 July 2026 (third follow-up: audit logs not storing at all)

This one was verified against a **real MySQL server**, not just reasoned about — I installed
MySQL 8.0 locally, loaded the actual schema, configured it to mimic a production IST-based
server, and ran the real code against it until I could reproduce and fix the exact failure.

**1. Root cause: an unhandled error on a pooled connection was corrupting a different, unrelated
query.** The previous fix added `connection.query("SET time_zone='+00:00'")` in `db.js` for every
new pooled connection — but without an error callback. Proven directly: if that query ever fails
for *any* reason (permissions, a managed/restricted DB host, anything), MySQL's error response
gets silently misdelivered to whatever query runs *next* on that same connection, rather than
being dropped or logged. Since audit-log inserts fire on almost every action in the app, they were
statistically the most likely thing to absorb someone else's stray error — matching "everything
works except audit logs" exactly. Fixed in `backend/config/db.js` by attaching a proper error
callback, so a failure is now safely logged to the server console instead of corrupting an
unrelated request. Verified with: a single call, a 20-concurrent-request burst (forces many brand
new pooled connections at once — the exact scenario most likely to trigger this), and a full
real HTTP login test through the actual server — all confirmed audit logs write and display
correctly with accurate UTC timestamps.

**2. A second, more serious problem found while investigating: `ADD COLUMN IF NOT EXISTS` is not
valid MySQL syntax.** I had used this in the DA-locations/single-day-travel migration, assuming
MySQL 8.0.29+ supported it. Tested directly against a real MySQL 8.0.46 server: it's a hard syntax
error, not a graceful no-op. **This means that migration likely never successfully applied to your
database at all** — meaning the From/To Location fields and Single-Day Travel flag may never have
actually been saving, even though the app didn't visibly error (the backend has defensive
fallbacks for missing columns, so it degraded silently instead of crashing). The pre-existing
`add_travel_total_amount.sql` migration had the identical problem and was likely never applied
either. Both migration files have been rewritten using a portable, genuinely idempotent pattern (a
small procedure that checks `INFORMATION_SCHEMA` before altering) — tested: runs clean on a fresh
database, runs clean again on re-run, correctly creates every expected column both times.

**What to do:** restart the backend (picks up the `db.js` fix), then run both migration files —
this is likely the *first time* the DA-locations migration actually succeeds. Worth checking
afterward whether From/To Location and Single-Day Travel data start saving correctly, since they
may have been silently no-ops until now.

---

## Update — 20 July 2026 (second follow-up)

**1. Overlap fix extended across Journey ↔ Return ↔ Stay.** The previous overlap fix only
deduplicated shared dates *within* one section (e.g. two Travel Days entries). Your new example —
an onward journey ending 2-Jul and a return journey starting 2-Jul — spans two *different*
sections (Travel Days and Return Journey), which the first fix didn't cover. The dedup logic now
runs across **all three sections combined** (Travel Days + Return Journey + Stay Days), so a
calendar day claimed anywhere in the trip is never billed a second time anywhere else in it. Your
exact scenario (1→2 Jul journey, 2→3 Jul return) now correctly totals **3 days**, not 4. Verified
with automated tests, including the boundary case where a Stay entry starts the same day a Journey
entry ends.

**2. Department filter added to "All Expenses".** A Department dropdown now sits alongside the
existing Status filter on the All Expenses tab (Coordinator/HR/Accounts/Admin). It's populated
from whatever departments are actually visible to the signed-in user, so a Coordinator — who can
already only see their own department's expenses — will simply see their one department listed,
while HR/Accounts/Admin see every department. No backend or database changes were needed; the
data was already being returned.

**3. Audit log timestamp bug — root cause found and fixed.** Confirmed and fixed: your 5:02 PM
login showing as 4:02 AM the *next day* (an 11-hour error) was caused by the IST offset (+5:30)
being applied **twice**:
  - `backend/config/audit.js` was explicitly converting `NOW()` from UTC to IST with
    `CONVERT_TZ(...)`, assuming the database's clock was in UTC.
  - But the database server's session was actually running in whatever timezone its OS is set to
    (not UTC), so the driver's own UTC assumption (`timezone: 'Z'` in `db.js`) was already silently
    adding a second +5:30 on top when displaying it.
  - Fixed by forcing every database connection's session to genuinely run in UTC
    (`backend/config/db.js`, via `SET time_zone='+00:00'` on connect) and removing the now-redundant
    `CONVERT_TZ(...)` call in `audit.js`.

  ⚠️ **Please read before assuming this is fully resolved:** this was a systemic issue, not
  something isolated to the audit log — the *same* mismatch likely affects every other timestamp
  in the app (expense submitted/reviewed times, receipt upload times, etc.), just less obviously,
  since a same-day 5.5-hour shift is much easier to miss than one that crosses into the next
  calendar date. This fix makes all **new** timestamps correct going forward. It does **not**
  retroactively correct timestamps already stored in the database before this update — I didn't
  want to run a blind mass data correction against your production data without your confirmation
  first. Please spot-check a few *older* records first (e.g. an expense you personally remember
  submitting at a specific time) — if their displayed time also looks off, let me know and I can
  write a one-time correction script for the existing rows.

**4. Mobile responsiveness — bug found in Section 2 and fixed.** The From/To Location fields you
asked about (and, it turns out, every field in the Daily Allowance entry rows) were being forced
into a fixed 3-column layout via an inline style that silently overrode the CSS breakpoints meant
to collapse it on narrow screens. Replaced it with the same auto-wrapping responsive grid pattern
already used correctly elsewhere in the form (Travel/Food/Hotel/Misc sections), so it now adapts
properly on mobile instead of just Sections 3–7. (I also caught myself about to introduce the
exact same bug in the new Department filter dropdown above — fixed before it shipped.)

---

## Update — 20 July 2026 (follow-up fixes)

**1. Overlapping-date double-counting fixed.** If a DA subsection (Travel Days, Return
Journey, or Stay Days) has more than one entry and two entries share a date — e.g. Leg 1 is
1‑Jul→2‑Jul and Leg 2 is 2‑Jul→3‑Jul — 2‑Jul was previously being billed in *both* entries
(4 days total instead of the correct 3). It's now counted once: the calendar days across all
entries in that subsection are deduplicated before the day-count and amount are calculated.
This works regardless of which order you type the entries in — it resolves by date, not by
entry order. A row's "No. of Days" now shows a small note (e.g. "−1 day already counted in
another entry") whenever an overlap was trimmed, so it's clear why the number looks lower
than a plain date-range calculation. Frontend-only change (`Section2_DailyAllowance.jsx`) —
no database or backend changes were needed, since the corrected numbers flow through the
same save path as before.

**2. Single-Day Travel: To Date auto-fills from From Date.** When "Single-Day Travel" is
selected, the To Date field on Travel Days and Stay Days entries now automatically mirrors
whatever date is picked in From Date, and becomes locked (read-only) so it can't drift out of
sync. This closes the gap where a "single day" entry could still accidentally be saved as a
multi-day range.

---

## 1. Before you deploy

1. **Run the migration** against your database (adds new columns, does not touch existing data):
   `backend/migrations/add_da_locations_and_single_day_travel.sql`
2. **Backend:** `cd backend && npm install` — picks up the new `archiver` package (used for the
   "Download All Attachments" ZIP feature).
3. **Frontend:** `cd frontend && npm install && npm run build` — the `dist/` folder in this zip has
   already been rebuilt from the updated source, but rebuild again if you make any further edits.

No other environment variables or config changes are needed.

---

## 2. From / To Location on DA claims
Every Daily Allowance entry — **DA for Travel Days**, **Return Journey**, and **DA for Stay Days
(Site Allowance)** — now has From Location and To Location fields, both when claiming and when
viewing/exporting an expense (form, read-only view, and PDF).

- New columns: `from_location`, `to_location` on `journey_allowance`, `return_allowance`,
  `stay_allowance`.
- Backend detects whether the migration has been run and degrades gracefully if not (so a deploy
  without an immediate DB migration won't crash — it just won't save locations yet).

## 3. Renamed sections
- "Travel Journey" → **"DA for Travel Days"**
- "Stay Details" → **"DA for Stay Days (Site Allowance)"**
- "Return Journey" kept its name (it's a sub-part of Travel Days, not renamed separately).
- Updated everywhere the labels appear: the claim form, the read-only expense view, and the PDF
  export.

## 4. Single-Day Travel toggle
New radio option in Section 2 (Daily Allowance): **"Is this a Single-Day Travel?"**

- Selecting **Yes** disables and clears the **Return Journey (B)** block, so DA can't be
  auto-calculated twice for a trip that starts and ends the same day.
- This is enforced both in the UI (fields become read-only/greyed out) and on the server (any
  Return Journey rows are ignored even if sent in the request) — so it can't be bypassed.
- New column: `expense_form.is_single_day_travel`.
- Shown as a badge on the read-only expense view when set.

## 5. Backup Database (Admin)
New sidebar item **"Backup Database"** (admin role only) → one-click download of a full `.sql`
dump of every table in the database.

- No external tools required (e.g. no `mysqldump` binary needed on the server) — it's a pure
  Node.js implementation using the existing MySQL connection.
- Every backup download is recorded in the Audit Log (`database_backup` action).
- New endpoint: `GET /api/admin/backup-database`.

## 6. Download All Attachments (one click)
A **"⬇️ Download All"** button now appears on the Receipts & Attachments section (Section 7)
whenever an expense has at least one file uploaded — on both the claim form and the read-only
expense view.

- Bundles every attachment for that expense into a single ZIP file, organized into folders by
  category (Travel / Hotel / Food / Miscellaneous / Special-Permission).
- Same visibility rules as viewing the expense itself (owner, assigned coordinator, HR, Accounts,
  Admin).
- New endpoint: `GET /api/expenses/:id/receipts/download-all`.
- New dependency: `archiver` (added to `backend/package.json`).

## 7. Fixed: HR wasn't being notified on coordinator approval
Confirmed and fixed the reported bug — when a coordinator approved an expense, the submitter got
an email, but **HR never received a notification** that a new item was waiting for review. Fixed
in two places:

- The normal approval flow (`POST /api/expenses/:id/approve`): coordinator approval now emails all
  active HR users; HR approval now emails all active Accounts users (same pattern applied one
  level up, for consistency).
- A related bug in the same area: when a coordinator/HR/Accounts employee submits their **own**
  expense, it auto-skips the coordinator stage and goes straight to "coordinator_approved" — but
  it was *also* silently failing to notify HR in that case. Fixed the same way.

All notification emails are non-fatal (a failed email never blocks the approval/submission itself
— it's logged to the server console and the action still succeeds).
