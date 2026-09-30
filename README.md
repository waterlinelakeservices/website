# Waterline Lake Services — website

Static site for [waterlinelakeservices.com](https://waterlinelakeservices.com). No build step — plain HTML/CSS/JS, deployed as-is.

## Structure

- `index.html` — main marketing site: hero, packages, how-it-works, quote request form, footer.
- `internalquote/index.html` — staff-only live quote calculator (kept out of search via a `noindex, nofollow` robots tag; not linked from the public site). Deploys to `/internalquote`.
- `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` — browser tab / bookmark icon, built from the brand mark.
- `agreement/index.html` — customer-facing storage agreement signing page (`/agreement/?customerId=rec…`). Replaces the old agreements.waterlinelakeservices.com site.
- `winterize/index.html` — the staff app (`/winterize`): a board of every boat in service, and for each boat a Check-in tab (HIN, condition photos, damage, items, keys, customer signature) plus the winterization tabs (Boat, Checklist, Photos, Parts, Finish) that produce the customer service report. PIN required. `/checkin` redirects here.
- `netlify/functions/winterize.js` — staff API for `/winterize` (PIN checked on every call).
- `netlify/functions/agreement.js` — public API for the signing page: loads the customer's boats and check-ins, builds the signed PDF on the server, saves it to Airtable, and copies it to Google Drive.
- `netlify/functions/_agreement-text.js` — **the agreement wording**. Edit it only here; bump `VERSION` whenever the wording changes. Have counsel review changes.
- `netlify/functions/_wl.js` — shared Airtable table/field IDs and helpers. `lib/pdf-lib.min.js` is vendored (MIT) so no `package.json` is needed.
- `netlify.toml` — tells Netlify to publish the repo root with no build command.

## Deploying

Connect this repo to Netlify via "Import from Git." No build command or publish directory override needed — `netlify.toml` already sets `publish = "."`. Every push to `main` auto-deploys.

## Brand quick reference

- Colors: Deep `#134E5E`, Deep Dark `#0C3944`, Pine `#2F5D50`, Glacier `#8CC7D6`, Stone `#E8ECEF`, Wash `#F2F9FA`.
- Fonts: Fraunces (headings), Work Sans (body) — both loaded from Google Fonts in each page's `<head>`.
- Full business context, target market, and pricing logic: see `Waterline_Business_Handoff.docx` from the account handoff package (not included in this repo — it's reference material, not site code).

## Quote request form

The homepage form posts to a Google Apps Script web app endpoint (`GAS_URL` near the bottom of `index.html`), which writes to a Google Sheet. If that Apps Script's owning Google account ever changes, the endpoint needs to be redeployed and `GAS_URL` updated here.

## How it fits together

Staff open **`/winterize`** and see **Boats in service**: one card per boat, with its stage, a search box (HIN, customer, or boat), and stage filters. Each card has a trash button that opens a confirmation popup before anything is removed.

Stages come from the **Stage** formula fields in Airtable, so the board and Airtable always match:
Checking in → Awaiting signature → Check-in complete → In winterization → Needs review → Complete.

Opening a boat shows six tabs:

1. **Check-in**: enter the HIN (finds or creates the Boat and Customer in Airtable), where it was received, engine hours, fuel, 7 required condition photos, existing damage, items aboard, keys. Then the customer signs: on the tech's device (recorded as witnessed by that tech) or by a texted/emailed link to `/agreement`. An owner can override with a logged reason. Customer, boat, HIN, and engine hours live here only; the winterization job copies them.
2. **Boat**: service type, cooling, engine, parts profile, oil block, technician, date in (what drives the checklist).
3. **Checklist**, **Photos**, **Parts**, **Finish**: the winterization. Locked until a job is started; a job normally needs a signed check-in. Finish produces the customer service report PDF.

The customer signing page (`/agreement`) shows every boat on the customer's record, the check-in condition report with photos (customer acknowledges it), the full agreement, e-sign consent, and a typed or drawn signature. One agreement per customer per season covers all boats they check.

Everything hangs off the **Boat** record (keyed by HIN): Boats → Check-ins → Agreements, and Boats → Winterization Jobs → Photos, all linked to the Customer. Seasons run July 1 – June 30 (e.g. `2026-2027`), Eastern time.

**Removing:** the trash button can delete a winterization job and/or a check-in, with their photos. It never deletes customers, boats, or signed agreements. A signed check-in is left unchecked by default, since its photos document the boat's condition at drop-off.

### Visits: several boats, one signature

A customer's **visit** is every boat checked in for them this season that isn't signed for yet. On the Check-in tab, the "boats this visit" card lists them and has **+ Check in another boat**, which offers the customer's other Boat records (asking for a HIN if one isn't on file) or adds a new boat. Each boat keeps its own Check-in record (its own HIN, hours, photos, damage, keys), so nothing is duplicated; one signature then covers all of them.

Each check-in has a **Package** (Anchor, Harbor, Flagship), prefilled from the customer's most advanced quote in Airtable.

### The agreement (`_agreement-text.js`)

One document per signing, assembled on the server from the packages of the boats being signed for:
- shared terms for everyone (parties, packages, **property access**, **batteries**, **winterization & freeze protection**, condition at check-in, fees, insurance, liability, indemnity, general terms);
- **storage terms** for Harbor/Flagship boats (facility, season, early/late charges, bailment, facility visits, hard deadline);
- **on-site terms** for Anchor boats (no storage, owner keeps custody, lifts & site conditions, winter risks after service).

A customer with both gets both sets, labeled. Each of the three versions has its own SHA-256 fingerprint, which is recorded on the Agreement row. On the signing page the customer also gives, per boat, where to keep the **battery** (the "keep it at Waterline" option is only offered for stored boats), plus **where the boats are kept** and access notes, and must check the **property access** authorization. These are saved on the Agreement (Packages, Battery Instructions, Access Notes, Property Access Acknowledged) and on each Check-in (Package, Battery Storage).

**The v2 wording (Anchor terms, property access, batteries, freeze protection) is a draft and needs attorney review.**

### Customer links and the future boat profile

Each customer has a private **Portal Key** (Customers table), created automatically. Links look like `/agreement/?k=<key>`; the older `?customerId=` links still work. The same key is meant for the future customer **boat profile** (check-in photos, then service history), which will read from Check-ins, Winterization Photos, Agreements, and Winterization Jobs. A job appears there only when it's **Complete** and **Share with Customer** is checked.

### Airtable tables (Waterline Marketing base)

- **Check-ins**: one row per boat per check-in. Status: In Progress → Awaiting Signature → Signed (or Override). `Winterization Status` (rollup) and `Stage` (formula) show where the boat is overall. Photos go in Winterization Photos, linked by `Check-in`.
- **Winterization Jobs**: `Stage` (formula) uses the same stage names. `Check-in` links the job to its check-in.
- **Winterization Photos**: each photo links to its check-in or job **and** to its `Boat` (kept in sync if the check-in's boat changes); `Customer` is looked up through the boat. `Upload ID` makes photo uploads safe to retry.
- **Agreements**: `Submission ID` makes the customer's Sign tap safe to retry. Boats a customer adds on the signing page become real Boat records on their customer record.

### Duplicate guards (server-side)

- A new customer with the same email or phone as an existing one reuses that record.
- A Boat is found by HIN before one is created; a HIN already on another customer's boat is refused.
- One open check-in per HIN per season, and one open winterization job per HIN: starting another opens the existing one.
- A photo upload retried after a dropped connection is saved once (by `Upload ID`).
- A Sign retried from the same page visit returns the agreement already saved (by `Submission ID`).
- **Agreements**: one row per signing. Signed PDF and signature image are attachments. Also records signer name/email/phone/address, server timestamp, IP, device, witness (if signed on a staff device), agreement version and SHA-256 fingerprint of the exact text, e-sign consent, and condition acknowledgment. `Drive Link` / `Drive Status` show the Google Drive copy.
- **Customers → Waiver Link**: formula that produces the link to send a customer: `"https://waterlinelakeservices.com/agreement/?customerId=" & RECORD_ID()`.

### Google Drive copy

The signed PDF is always attached in Airtable first (the record of truth). A copy then goes to the **Signed Waivers** Drive folder through a small Google Apps Script web app owned by service@waterlinelakeservices.com (kept only in Apps Script, not in this repo). If the Drive copy fails, `Drive Status` on the Agreement row says why, and the PDF is still safe in Airtable.

## Winterization checklist (`/winterize`)

Techs open `https://waterlinelakeservices.com/winterize` on any phone or tablet, sign in with their PIN, and work boat by boat starting from the HIN. Everything saves to the Waterline Marketing Airtable base through `netlify/functions/winterize.js`:

- **Winterization Jobs**: one row per boat per season. Summary columns (status, readings, parts, recommendations, spring list) plus the full checklist in `App State` (JSON, don't hand-edit). Signatures and the customer report PDF are attachments on the row.
- **Winterization Photos**: one row per photo, image in the `Photo` attachment field, linked to its job, tagged with the checklist step.
- **Boats**: HIN, model year, engine, service type, cooling, parts profile, hours, last winterized date, and impeller replacement date are written back to the linked boat. Every job is always linked to a Boat record.

### Netlify environment variables

- `AIRTABLE_TOKEN`: already set for the quote functions. Needs `data.records:read` and `data.records:write` on the base.
- `WINTERIZE_PINS`: one entry per tech, `Name:PIN` separated by commas, e.g. `Brian:######,Ben:######`. Use 6+ random digits. Remove or change a PIN to lock that person out; they're signed out on their next action. Used by `/winterize`, and to record the witness when a customer signs on a staff device.
- `DRIVE_UPLOAD_URL`: the Apps Script web app URL (ends in `/exec`).
- `DRIVE_UPLOAD_SECRET`: shared password between the site and the Apps Script. Must match `SECRET` in the script.

Env var changes only take effect after a new deploy (Deploys → Trigger deploy).

### Privacy

`/agreement` and `/winterize` are both `noindex` and not cached. The staff pages carry `noindex, nofollow` in a meta tag and in the `X-Robots-Tag` header, isn't in the sitemap, and isn't linked from the public site. It's deliberately **not** listed in `robots.txt`: that file is public, so listing the path would advertise it, and a robots block would stop crawlers from seeing the `noindex` tag. The page itself holds no customer data; everything is fetched from the function, which rejects any request without a valid PIN.

### Offline

Checklist progress is kept on the device and syncs when there's signal. Photos taken with no signal wait on the device and upload automatically once the connection is back. Starting a new job or check-in, searching customers, and customer signing need signal.
