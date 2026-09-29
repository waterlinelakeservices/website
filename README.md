# Waterline Lake Services — website

Static site for [waterlinelakeservices.com](https://waterlinelakeservices.com). No build step — plain HTML/CSS/JS, deployed as-is.

## Structure

- `index.html` — main marketing site: hero, packages, how-it-works, quote request form, footer.
- `internalquote/index.html` — staff-only live quote calculator (kept out of search via a `noindex, nofollow` robots tag; not linked from the public site). Deploys to `/internalquote`.
- `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` — browser tab / bookmark icon, built from the brand mark.
- `winterize/index.html` — staff-only winterization checklist for techs on phones/tablets. Deploys to `/winterize`. Not linked anywhere, `noindex` in both the page and headers, and every action requires a tech PIN checked server-side. See "Winterization checklist" below.
- `netlify.toml` — tells Netlify to publish the repo root with no build command.

## Deploying

Connect this repo to Netlify via "Import from Git." No build command or publish directory override needed — `netlify.toml` already sets `publish = "."`. Every push to `main` auto-deploys.

## Brand quick reference

- Colors: Deep `#134E5E`, Deep Dark `#0C3944`, Pine `#2F5D50`, Glacier `#8CC7D6`, Stone `#E8ECEF`, Wash `#F2F9FA`.
- Fonts: Fraunces (headings), Work Sans (body) — both loaded from Google Fonts in each page's `<head>`.
- Full business context, target market, and pricing logic: see `Waterline_Business_Handoff.docx` from the account handoff package (not included in this repo — it's reference material, not site code).

## Quote request form

The homepage form posts to a Google Apps Script web app endpoint (`GAS_URL` near the bottom of `index.html`), which writes to a Google Sheet. If that Apps Script's owning Google account ever changes, the endpoint needs to be redeployed and `GAS_URL` updated here.

## Winterization checklist (`/winterize`)

Techs open `https://waterlinelakeservices.com/winterize` on any phone or tablet, sign in with their PIN, and work boat by boat starting from the HIN. Everything saves to the Waterline Marketing Airtable base through `netlify/functions/winterize.js`:

- **Winterization Jobs**: one row per boat per season. Summary columns (status, readings, parts, recommendations, spring list) plus the full checklist in `App State` (JSON, don't hand-edit). Signatures and the customer report PDF are attachments on the row.
- **Winterization Photos**: one row per photo, image in the `Photo` attachment field, linked to its job, tagged with the checklist step.
- **Boats**: HIN, model year, engine, serial, service type, cooling, parts profile, hours, storage spot, last winterized date, and impeller replacement date are written back to the linked boat.

### Netlify environment variables

- `AIRTABLE_TOKEN`: already set for the quote functions. Needs `data.records:read` and `data.records:write` on the base.
- `WINTERIZE_PINS`: one entry per tech, `Name:PIN` separated by commas, e.g. `Brian:482913,Ben:771204`. Use 6+ digits. Remove or change a PIN to lock that person out; they're signed out on their next action.

### Privacy

The page carries `noindex, nofollow` in a meta tag and in the `X-Robots-Tag` header, isn't in the sitemap, and isn't linked from the public site. It's deliberately **not** listed in `robots.txt`: that file is public, so listing the path would advertise it, and a robots block would stop crawlers from seeing the `noindex` tag. The page itself holds no customer data; everything is fetched from the function, which rejects any request without a valid PIN.

### Offline

Checklist progress is kept on the device and syncs when there's signal. Photos taken with no signal wait on the device and upload automatically once the connection is back. Starting a new job and searching customers need signal.
