# Waterline Lake Services — website

Static site for [waterlinelakeservices.com](https://waterlinelakeservices.com). No build step — plain HTML/CSS/JS, deployed as-is.

## Structure

- `index.html` — main marketing site: hero, packages, how-it-works, quote request form, footer.
- `internalquote/index.html` — staff-only live quote calculator (kept out of search via a `noindex, nofollow` robots tag; not linked from the public site). Deploys to `/internalquote`.
- `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` — browser tab / bookmark icon, built from the brand mark.
- `netlify.toml` — tells Netlify to publish the repo root with no build command.

## Deploying

Connect this repo to Netlify via "Import from Git." No build command or publish directory override needed — `netlify.toml` already sets `publish = "."`. Every push to `main` auto-deploys.

## Brand quick reference

- Colors: Deep `#134E5E`, Deep Dark `#0C3944`, Pine `#2F5D50`, Glacier `#8CC7D6`, Stone `#E8ECEF`, Wash `#F2F9FA`.
- Fonts: Fraunces (headings), Work Sans (body) — both loaded from Google Fonts in each page's `<head>`.
- Full business context, target market, and pricing logic: see `Waterline_Business_Handoff.docx` from the account handoff package (not included in this repo — it's reference material, not site code).

## Quote request form

The homepage form posts to a Google Apps Script web app endpoint (`GAS_URL` near the bottom of `index.html`), which writes to a Google Sheet. If that Apps Script's owning Google account ever changes, the endpoint needs to be redeployed and `GAS_URL` updated here.
