// Customer-facing storage agreement at /agreement?customerId=recXXXX
//
// action "load"      -> customer info, their Boat records, this season's open
//                       check-ins (condition report only; photos stay with Waterline), and the agreement text.
// action "submit"    -> server builds the signed PDF from ITS OWN copy of the
//                       agreement text (never trusts text sent by the browser),
//                       stamps server time + IP, creates an Agreements row linked
//                       to the Customer, every covered Boat, and the open
//                       Check-ins, attaches the PDF, and marks those check-ins Signed.
// action "driveCopy" -> copies the signed PDF into Google Drive through the
//                       Apps Script in DRIVE_UPLOAD_URL. Idempotent; the page
//                       calls it right after signing and the check-in app retries.
//
// If the request carries a valid tech PIN (the page was opened from the staff app on
// a staff tablet), the signature is recorded as "In person on staff device"
// with that tech as witness.
//
// Env: AIRTABLE_TOKEN, WINTERIZE_PINS (for witness), DRIVE_UPLOAD_URL, DRIVE_UPLOAD_SECRET.

const crypto = require('crypto');
const W = require('./_wl');
const AT = require('./_agreement-text');
const { VERSION, SEASON } = AT;
const { PDFDocument, StandardFonts, rgb } = require('./lib/pdf-lib.min.js');

const { T, CUST, BOAT, CHK, AGR, PHOTO } = W;
// One fingerprint per version of the text: storage terms, Anchor terms, or both.
const DOCS = {};
['storage', 'anchor', 'both'].forEach((c) => { const doc = AT.compose(c); DOCS[c] = { doc, sha: crypto.createHash('sha256').update(VERSION + '\n' + c + '\n' + JSON.stringify(doc)).digest('hex') }; });
const ACCESS_TEXT = 'I authorize Waterline Lake Services to access my property, dock, and lift at the location above to pick up, deliver, and/or service my boat(s) as this agreement describes.';
const FACILITY = 'Waterline Storage Facility';
const storageOf = (pkg) => AT.STORAGE_PACKAGES.includes(pkg) ? FACILITY : "Owner's lift or property";
// Where the customer wants each battery kept after we disconnect it.
const BATTERY = {
  boat: 'Leave it in the boat, disconnected',
  property: 'Take it out and leave it at my property',
  waterline: 'Take it out and keep it at Waterline with my boat',
  other: 'Other',
};
const batteryText = (b) => b && BATTERY[b.choice] ? BATTERY[b.choice] + (b.note ? ': ' + b.note : '') : '';
const CONSENT_TEXT = 'I agree to sign this Agreement electronically and to receive it and related records electronically (U.S. ESIGN Act; Indiana Uniform Electronic Transactions Act).';
const AGREE_TEXT = 'I have read and agree to the Waterline Lake Services agreement above, and I am authorized to sign on behalf of the vessel(s) listed.';
const CONDITION_TEXT = 'I have reviewed the condition of my vessel(s) as documented at check-in.';

const OPEN = ['In Progress', 'Awaiting Signature'];

// ---------- data for the page ----------
async function loadCustomer(token, p) {
  // Links carry the customer's private key (?k=). Older links used the record ID.
  let c = null;
  if (p.k) c = await W.customerByKey(token, p.k);
  else if (W.recId(p.customerId)) { try { c = await W.getRec(token, T.customers, W.recId(p.customerId)); } catch (e) { c = null; } }
  if (!c) throw W.fail(404, 'We couldn\u2019t find this agreement link. Please contact us for a new one.');
  const f = c.fields || {};
  if (!f[CUST.portalKey]) { try { f[CUST.portalKey] = await W.ensurePortalKey(token, c.id, ''); } catch (e) { /* link still works this time */ } }
  const boats = (await W.byIds(token, T.boats, f[CUST.boats] || [], W.BOAT_READ)).map(W.boatOut);
  const checkinRecs = await W.byIds(token, T.checkins, f[CUST.checkins] || [], [
    CHK.title, CHK.boat, CHK.status, CHK.season, CHK.at, CHK.by, CHK.where, CHK.hours, CHK.fuel, CHK.damage, CHK.items, CHK.keys, CHK.photos, CHK.hin, CHK.package, CHK.state,
  ]);
  const season = W.seasonFor();
  const checkins = checkinRecs
    .filter((r) => r.fields[CHK.season] === season && OPEN.includes(W.sel(r.fields[CHK.status])))
    .map((r) => {
      const x = r.fields;
      return {
        id: r.id, status: W.sel(x[CHK.status]), boatId: (x[CHK.boat] || [])[0] || null, hin: x[CHK.hin] || '', at: x[CHK.at] || '', by: x[CHK.by] || '',
        where: W.sel(x[CHK.where]), hours: x[CHK.hours] || '', fuel: W.sel(x[CHK.fuel]), damage: x[CHK.damage] || '',
        items: x[CHK.items] || '', keys: x[CHK.keys] || '', photoIds: x[CHK.photos] || [], package: W.sel(x[CHK.package]),
        // Staff choose per boat whether the customer sees the photos (on unless turned off).
        sharePhotos: (() => { try { return (JSON.parse(x[CHK.state] || '{}') || {}).sharePhotos !== false; } catch (e) { return true; } })(),
      };
    });
  // Each boat's package: from its check-in, else its (or the customer's) most advanced quote.
  const quotes = (f[CUST.quotes] || []).length ? (await W.byIds(token, 'tblm3InsiBnTS1bqg', f[CUST.quotes], [W.QUOTE.boat, W.QUOTE.package, W.QUOTE.status, W.QUOTE.submitted])) : [];
  const RANK = { 'Paid': 6, 'Invoiced': 5, 'Quote Accepted': 5, 'Booked': 4, 'Quoted': 3, 'Contacted': 2, 'New': 1 };
  const qs = quotes.map((q) => ({ boats: q.fields[W.QUOTE.boat] || [], pkg: W.sel(q.fields[W.QUOTE.package]), rank: RANK[W.sel(q.fields[W.QUOTE.status])] || 0, at: q.fields[W.QUOTE.submitted] || '' }))
    .filter((q) => W.PKG_NAMES.includes(q.pkg) && q.rank > 0).sort((a, b) => b.rank - a.rank || String(b.at).localeCompare(String(a.at)));
  boats.forEach((b) => {
    const ci = checkins.find((x) => x.boatId === b.id && x.package);
    b.package = ci ? ci.package : ((qs.find((q) => q.boats.includes(b.id)) || qs[0] || {}).pkg || '');
    b.packageFixed = !!ci;
  });
  return { rec: c, customer: W.customerOut(c), boats, checkins, signedIds: f[CUST.agreements] || [], guess: (qs[0] || {}).pkg || '' };
}

async function photosFor(token, ids) {
  const recs = await W.byIds(token, T.photos, ids, [PHOTO.caption, PHOTO.photo, PHOTO.at, PHOTO.checkin]);
  return recs.map((r) => {
    const att = (r.fields[PHOTO.photo] || [])[0];
    return { id: r.id, checkin: (r.fields[PHOTO.checkin] || [])[0] || null, cap: r.fields[PHOTO.caption] || '', at: r.fields[PHOTO.at] || '', thumb: W.attUrl(att, 'large'), url: att && att.url };
  }).filter((p) => p.thumb).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

// ---------- PDF ----------
const WINANSI_EXTRA = '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';
const safe = (s) => String(s == null ? '' : s).replace(/[\t\r]/g, ' ').split('').map((ch) => {
  const c = ch.charCodeAt(0);
  if (ch === '\n' || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.includes(ch)) return ch;
  if (c === 0x2212) return '-';
  return '?';
}).join('');
const eastern = (d) => d.toLocaleString('en-US', { timeZone: 'America/Indiana/Indianapolis', dateStyle: 'long', timeStyle: 'long' });

async function buildPdf(p) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Waterline Storage Agreement ${p.ref}`);
  doc.setAuthor('Waterline Lake Services LLC');
  doc.setSubject(`Signed by ${p.signer.name} on ${p.signedAtIso}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const W_ = 612, H_ = 792, M = 54, maxW = W_ - 2 * M;
  const DEEP = rgb(19 / 255, 78 / 255, 94 / 255), INK = rgb(22 / 255, 35 / 255, 43 / 255), MUTED = rgb(106 / 255, 116 / 255, 128 / 255), GLACIER = rgb(140 / 255, 199 / 255, 214 / 255);
  let page, y;
  const footer = () => page.drawText(safe(`Waterline Lake Services LLC  |  Agreement ${p.ref}  |  ${VERSION}  |  Signed ${p.signedAtIso}`), { x: M, y: 26, size: 7.5, font, color: MUTED });
  const newPage = () => { page = doc.addPage([W_, H_]); y = H_ - M; footer(); };
  const need = (h) => { if (y - h < M) newPage(); };

  // Rich line wrapping: runs of [text, font], wrapped by measured width.
  function rich(runs, { size = 9.5, lh = 13, indent = 0, color = INK } = {}) {
    const words = [];
    runs.forEach(([t, f]) => safe(t).split(/(\s+)/).forEach((w) => { if (w && !/^\s+$/.test(w)) words.push([w, f]); }));
    let line = [], width = 0; const space = font.widthOfTextAtSize(' ', size);
    const flush = () => {
      need(lh); let x = M + indent;
      line.forEach(([w, f], i) => { page.drawText(w, { x, y, size, font: f, color }); x += f.widthOfTextAtSize(w, size) + space; });
      y -= lh; line = []; width = 0;
    };
    words.forEach(([w, f]) => {
      const ww = f.widthOfTextAtSize(w, size);
      if (line.length && width + space + ww > maxW - indent) flush();
      width += (line.length ? space : 0) + ww; line.push([w, f]);
    });
    if (line.length) flush();
  }
  const text = (t, o = {}) => String(t).split('\n').forEach((ln) => rich([[ln || ' ', o.font || font]], o));
  const heading = (t) => { need(34); y -= 8; page.drawText(safe(t), { x: M, y, size: 12.5, font: serif, color: DEEP }); y -= 6; page.drawLine({ start: { x: M, y }, end: { x: M + 30, y }, thickness: 1.6, color: GLACIER }); y -= 14; };

  newPage();
  page.drawRectangle({ x: 0, y: H_ - 86, width: W_, height: 86, color: DEEP });
  page.drawText('Waterline', { x: M, y: H_ - 44, size: 22, font: serif, color: rgb(1, 1, 1) });
  page.drawText('Signed Service Agreement', { x: M, y: H_ - 66, size: 11, font, color: rgb(1, 1, 1) });
  page.drawText(safe(`Reference ${p.ref}`), { x: W_ - M - bold.widthOfTextAtSize(safe(`Reference ${p.ref}`), 11), y: H_ - 44, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(`Season ${SEASON}`), { x: W_ - M - font.widthOfTextAtSize(safe(`Season ${SEASON}`), 9.5), y: H_ - 62, size: 9.5, font, color: GLACIER });
  y = H_ - 112;

  heading('Owner');
  text(`Name: ${p.signer.name}`); text(`Email: ${p.signer.email}`);
  if (p.signer.phone) text(`Phone: ${p.signer.phone}`);
  if (p.signer.address) text(`Mailing address: ${p.signer.address}`);
  if (p.signer.quoteRef) text(`Quote / invoice reference: ${p.signer.quoteRef}`);

  heading('Schedule of Vessels');
  p.vessels.forEach((v, i) => {
    rich([[`${i + 1}. ${v.label}`, bold], [`${v.hin ? `   HIN: ${v.hin}` : '   HIN: not recorded'}`, font]]);
    text(`Package: ${v.package || 'not stated'}`, { indent: 12 });
    text(`Winter storage: ${v.package ? storageOf(v.package) : 'not stated'}`, { indent: 12 });
    text(`Battery: ${v.battery || 'not stated'}`, { indent: 12 });
  });

  const kinds = new Set(p.vessels.map((v) => AT.STORAGE_PACKAGES.includes(v.package) ? 's' : 'a'));
  const locLabel = kinds.has('s') && kinds.has('a') ? 'Pickup and service location' : kinds.has('s') ? 'Pickup and delivery location' : 'Service location';
  heading(`${locLabel}; property access`);
  text(`${locLabel}: ${p.access.address || 'as on file'}`);
  if (kinds.has('s')) text(`Boats on Harbor or Flagship are stored for the winter at the ${FACILITY}, 8660 W 550S, Columbus, IN 47201.`, { size: 8.5, lh: 11.5 });
  if (p.access.notes) text(`Access notes: ${p.access.notes}`);
  text(`[x] ${ACCESS_TEXT}`, { size: 8.5, lh: 11.5 });

  if (p.checkins.length) {
    heading('Condition documented at check-in');
    p.checkins.forEach((c) => {
      rich([[`${c.boatLabel}: `, bold], [`checked in ${c.at ? 'on ' + eastern(new Date(c.at)) : ''}${c.by ? ' by ' + c.by : ''}${c.where ? ', ' + c.where : ''}.`, font]]);
      const bits = [c.hours && `Engine hours: ${c.hours}`, c.fuel && `Fuel: ${c.fuel}`, c.keys && `Keys: ${c.keys}`].filter(Boolean).join('   ');
      if (bits) text(bits, { indent: 12 });
      text(`Existing damage noted: ${c.damage || 'None noted'}`, { indent: 12 });
      if (c.items) text(`Items aboard: ${c.items}`, { indent: 12 });
      text(`${c.photoCount} time-stamped condition photo${c.photoCount === 1 ? '' : 's'} on file with Waterline, available on request (check-in record ${c.id}).`, { indent: 12, font: ital, color: MUTED });
      y -= 4;
    });
  }

  heading('Agreement (as presented and agreed to at signing)');
  const AGREEMENT = DOCS[p.combo].doc;
  rich([[AGREEMENT.title, bold]], { size: 10 });
  rich([[AGREEMENT.subtitle, ital]], { size: 9, color: MUTED });
  y -= 4;
  AGREEMENT.sections.forEach((s) => {
    need(30); y -= 3; rich([[s.h, bold]], { size: 9.5 });
    s.p.forEach((para) => { rich(para.label ? [[para.label, bold], [para.text, font]] : [[para.text, font]], { size: 8.5, lh: 11.2 }); y -= 2; });
  });

  heading('Signature');
  need(90);
  if (p.sigType === 'Drawn' && p.sigPng) {
    const img = await doc.embedPng(p.sigPng);
    const w = 220, h = Math.min(80, (img.height / img.width) * w);
    page.drawImage(img, { x: M, y: y - h, width: (img.width / img.height) * h > w ? w : (img.width / img.height) * h, height: h });
    y -= h + 6;
  } else {
    page.drawText(safe(p.sigTyped), { x: M, y: y - 22, size: 22, font: ital, color: DEEP }); y -= 30;
  }
  page.drawLine({ start: { x: M, y }, end: { x: M + 260, y }, thickness: 0.8, color: MUTED }); y -= 12;
  text(`${p.signer.name}  (${p.sigType === 'Drawn' ? 'drawn' : 'typed'} electronic signature)`, { font: bold });
  y -= 6;
  heading('Signing record');
  [
    `Signed at: ${eastern(p.signedAt)}  (${p.signedAtIso} UTC, recorded by Waterline's server)`,
    `Signed via: ${p.via}${p.witness ? `, witnessed by ${p.witness}` : ''}`,
    `IP address: ${p.ip || 'not available'}`,
    `Device / browser: ${p.device || 'not available'}`,
    `Agreement version: ${VERSION}`,
    `Agreement fingerprint (SHA-256): ${DOCS[p.combo].sha}  (terms: ${p.combo})`,
  ].forEach((l) => text(l, { size: 8.5, lh: 11.5 }));
  y -= 4;
  [`[x] ${CONSENT_TEXT}`, `[x] ${AGREE_TEXT}`, `[x] ${ACCESS_TEXT}`].concat(p.conditionAck ? [`[x] ${CONDITION_TEXT}`] : []).forEach((l) => text(l, { size: 8.5, lh: 11.5 }));
  return doc.save();
}

// ---------- Drive copy ----------
async function driveCopy(token, agreementId) {
  const id = W.recId(agreementId); if (!id) throw W.fail(400, 'Bad agreement id');
  const r = await W.getRec(token, T.agreements, id);
  const f = r.fields || {};
  if (f[AGR.driveLink]) return { driveLink: f[AGR.driveLink], already: true };
  const url = process.env.DRIVE_UPLOAD_URL, secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret) { await W.patch(token, T.agreements, id, { [AGR.driveStatus]: 'Not set up: DRIVE_UPLOAD_URL / DRIVE_UPLOAD_SECRET missing' }); return { driveLink: null }; }
  const att = (f[AGR.pdf] || [])[0];
  if (!att) return { driveLink: null, pending: true };
  try {
    const pdf = Buffer.from(await (await fetch(att.url)).arrayBuffer());
    const res = await fetch(url, {
      method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, filename: att.filename || `Waterline-Agreement-${f[AGR.ref]}.pdf`, mimeType: 'application/pdf', data: pdf.toString('base64') }),
    });
    const txt = await res.text();
    let out; try { out = JSON.parse(txt); } catch (e) { throw new Error(`Apps Script returned ${res.status}: ${txt.slice(0, 120)}`); }
    if (!out.ok) throw new Error(out.error || 'Apps Script refused the upload');
    await W.patch(token, T.agreements, id, { [AGR.driveLink]: out.url, [AGR.driveStatus]: 'OK' });
    return { driveLink: out.url };
  } catch (e) {
    console.error('agreement driveCopy', id, e.message);
    await W.patch(token, T.agreements, id, { [AGR.driveStatus]: `Failed ${new Date().toISOString()}: ${W.str(e.message, 200)}` }).catch(() => {});
    return { driveLink: null, error: e.message };
  }
}

// ---------- actions ----------
const actions = {
  async load(token, p, ctx) {
    const d = await loadCustomer(token, p);
    // Photos go to the page only for boats where staff left "show photos" on; otherwise just the count.
    const photoIds = d.checkins.filter((c) => c.sharePhotos).flatMap((c) => c.photoIds);
    const photos = photoIds.length ? await photosFor(token, photoIds) : [];
    // Which of this customer's boats are already covered by a signed agreement this season?
    const signed = d.signedIds.length ? await W.byIds(token, T.agreements, d.signedIds, [AGR.ref, AGR.status, AGR.season, AGR.boats, AGR.signedAt]) : [];
    const covered = signed.filter((a) => W.sel(a.fields[AGR.status]) === 'Signed' && a.fields[AGR.season] === SEASON)
      .map((a) => ({ ref: a.fields[AGR.ref], signedAt: a.fields[AGR.signedAt], boats: a.fields[AGR.boats] || [] }));
    return {
      customer: { name: d.customer.name, email: d.customer.email, phone: d.customer.phone, address: d.customer.address },
      boats: d.boats.map((b) => ({ id: b.id, label: boatLabel(b), hin: b.hin, package: b.package, packageFixed: b.packageFixed })),
      checkins: d.checkins.map((c) => ({ id: c.id, boatId: c.boatId, package: c.package, at: c.at, by: c.by, where: c.where, hours: c.hours, fuel: c.fuel, damage: c.damage, items: c.items, keys: c.keys, photoCount: c.photoIds.length, photos: c.sharePhotos ? photos.filter((x) => x.checkin === c.id).map((x) => ({ thumb: x.thumb, url: x.url, cap: x.cap, at: x.at })) : [] })),
      covered, packageGuess: d.guess,
      packages: AT.PACKAGES.map((name) => ({ name, blurb: AT.PACKAGE_BLURB[name], storage: AT.STORAGE_PACKAGES.includes(name) })),
      battery: Object.entries(BATTERY).map(([id, label]) => ({ id, label, storageOnly: id === 'waterline', needsNote: id === 'property' || id === 'other' })),
      agreement: { version: VERSION, season: SEASON, docs: DOCS, consentText: CONSENT_TEXT, agreeText: AGREE_TEXT, conditionText: CONDITION_TEXT, accessText: ACCESS_TEXT },
      witness: ctx.tech || null,
    };
  },

  async submit(token, p, ctx) {
    if (!p.consent || !p.agree) throw W.fail(400, 'Please check the boxes to agree and consent to signing electronically.');
    if (!p.accessAck) throw W.fail(400, 'Please confirm we may access your property to pick up, deliver, or service your boat.');
    const access = { address: W.str(p.access && p.access.address, 250).trim(), notes: W.str(p.access && p.access.notes, 1000).trim() };
    if (access.address.length < 5) throw W.fail(400, 'Please tell us where we pick up or service your boat (address, lake, or dock).');
    const signer = {
      name: W.str(p.signer && p.signer.name, 120).trim(), email: W.str(p.signer && p.signer.email, 160).trim(),
      phone: W.str(p.signer && p.signer.phone, 40).trim(), address: W.str(p.signer && p.signer.address, 250).trim(),
      quoteRef: W.str(p.signer && p.signer.quoteRef, 80).trim(),
    };
    if (signer.name.length < 2 || !/^\S+@\S+\.\S+$/.test(signer.email)) throw W.fail(400, 'Please enter your full name and a valid email.');
    const sigType = p.sigType === 'Drawn' ? 'Drawn' : 'Typed';
    let sigPng = null, sigTyped = '';
    if (sigType === 'Drawn') {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(p.signature || ''));
      if (!m || m[1].length > 600000) throw W.fail(400, 'Please draw your signature again.');
      sigPng = Buffer.from(m[1], 'base64');
    } else {
      sigTyped = W.str(p.signature, 120).trim();
      if (sigTyped.length < 2) throw W.fail(400, 'Please type your full name as your signature.');
    }

    const d = await loadCustomer(token, p);

    // A retried Sign (the connection dropped after it went through) returns the agreement
    // already created from this page instead of making a second one.
    const submissionId = W.str(p.submissionId, 64).replace(/[^A-Za-z0-9-]/g, '');
    if (submissionId) {
      const prior = await W.list(token, T.agreements, { formula: `{Submission ID}="${submissionId}"`, fields: [AGR.ref, AGR.customer, AGR.signedAt, AGR.via, AGR.pdf], max: 1 });
      if (prior.length && (prior[0].fields[AGR.customer] || []).includes(d.customer.id)) {
        const f = prior[0].fields; const att = (f[AGR.pdf] || [])[0];
        let pdf = null;
        if (att) { try { pdf = Buffer.from(await (await fetch(att.url)).arrayBuffer()).toString('base64'); } catch (e) { pdf = null; } }
        return { ref: f[AGR.ref], id: prior[0].id, signedAt: f[AGR.signedAt], pdf, filename: (att && att.filename) || `Waterline-Agreement-${f[AGR.ref]}.pdf`, pdfSaved: !!att, via: W.sel(f[AGR.via]), already: true };
      }
    }

    const ownBoats = new Map(d.boats.map((b) => [b.id, b]));
    const chosen = (p.boatIds || []).filter((id) => ownBoats.has(id));
    // Boats with an open check-in are always covered: that's the point of signing now.
    d.checkins.forEach((c) => { if (c.boatId && ownBoats.has(c.boatId) && !chosen.includes(c.boatId)) chosen.push(c.boatId); });
    const extras = (p.extraVessels || []).slice(0, 10).map((v, i) => ({ key: 'x' + i,
      mmc: W.str(v.makeModel, 80).trim(), len: W.str(v.length, 20).trim(),
      label: [W.str(v.makeModel, 80).trim(), W.str(v.length, 20).trim()].filter(Boolean).join(', '), hin: W.str(v.hin, 40).trim().toUpperCase(),
    })).filter((v) => v.label || v.hin);
    if (!chosen.length && !extras.length) throw W.fail(400, 'Please include at least one boat.');
    // Package and battery answers per boat. A check-in's package is the one we agreed on at the boat.
    const answers = (key) => ({ pkg: W.str((p.packages || {})[key], 20), bat: (p.battery || {})[key] || null });
    const ciPkg = new Map(d.checkins.filter((c) => c.boatId && c.package).map((c) => [c.boatId, c.package]));
    const vessel = (label, hin, key, boatId) => {
      const a = answers(key); const pkg = (boatId && ciPkg.get(boatId)) || a.pkg;
      if (!AT.PACKAGES.includes(pkg)) throw W.fail(400, `Please choose a package for ${label}.`);
      const choice = a.bat && BATTERY[a.bat.choice] ? a.bat.choice : '';
      const note = W.str(a.bat && a.bat.note, 200).trim();
      if (!choice || ((choice === 'property' || choice === 'other') && note.length < 2)) throw W.fail(400, `Please tell us where to keep the battery for ${label}.`);
      if (choice === 'waterline' && !AT.STORAGE_PACKAGES.includes(pkg)) throw W.fail(400, `We can only keep the battery for boats stored with us. Please choose another option for ${label}.`);
      return { label, hin, package: pkg, battery: batteryText({ choice, note }), boatId };
    };
    // Check every answer before creating anything, so a missed question never leaves a half-saved boat.
    const pre = [...chosen.map((id) => vessel(boatLabel(ownBoats.get(id)), ownBoats.get(id).hin, id, id)), ...extras.map((v) => vessel(v.label || 'the boat you added', v.hin, v.key, null))];
    const combo = AT.comboFor(pre.map((v) => v.package));
    if (p.sha !== DOCS[combo].sha) throw W.fail(409, 'The agreement was updated since this page loaded. Please reload the page and review it again.');
    // Boats the owner adds here become real Boat records on their customer record, so the
    // agreement links to them (and a later check-in by HIN finds the same boat, not a new one).
    const unlinked = [];
    const keyOf = new Map(); // boat id -> key used for its answers ('x0' for an added boat)
    for (const v of extras) {
      const hin = v.hin.replace(/^US[-\s]?/, '').replace(/[^A-Z0-9]/g, '');
      const mm = v.mmc;
      let boat = null;
      if (hin.length >= 5) {
        const hit = await W.list(token, T.boats, { formula: `{HIN}="${W.esc(hin)}"`, fields: W.BOAT_READ, max: 1 });
        if (hit.length) {
          const b = W.boatOut(hit[0]);
          if (!b.custIds.length) { await W.patch(token, T.boats, b.id, { [BOAT.customer]: [d.customer.id] }); boat = b; }
          else if (b.custIds.includes(d.customer.id)) boat = b;
          else { unlinked.push({ key: v.key, label: v.label || 'Vessel (added by owner)', hin }); continue; } // HIN is on someone else's boat: keep as text for staff to sort out
        }
      }
      if (!boat) {
        const lenNum = W.num(v.len.replace(/[^0-9.]/g, ''));
        const rec = await W.create(token, T.boats, { [BOAT.name]: mm || 'Boat', [BOAT.customer]: [d.customer.id], [BOAT.hin]: hin.length >= 5 ? hin : undefined, [BOAT.mmc]: mm || undefined, [BOAT.length]: lenNum });
        boat = W.boatOut(rec);
      }
      if (!chosen.includes(boat.id)) chosen.push(boat.id);
      if (!keyOf.has(boat.id)) keyOf.set(boat.id, v.key);
      ownBoats.set(boat.id, boat);
    }
    const vessels = [
      ...chosen.map((id) => vessel(boatLabel(ownBoats.get(id)), ownBoats.get(id).hin, keyOf.get(id) || id, id)),
      ...unlinked.map((u) => vessel(u.label, u.hin, u.key, null)),
    ];


    const checkins = d.checkins.filter((c) => !c.boatId || chosen.includes(c.boatId)).map((c) => ({
      ...c, photoCount: c.photoIds.length, boatLabel: c.boatId && ownBoats.get(c.boatId) ? boatLabel(ownBoats.get(c.boatId)) : (c.hin || 'Boat'),
    }));

    const signedAt = new Date();
    const ref = 'WL-' + signedAt.toISOString().slice(2, 7).replace('-', '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const via = ctx.tech ? 'In person on staff device' : "Customer's own device";
    const device = W.str(ctx.ua, 500);
    const pdfBytes = await buildPdf({
      ref, signer, vessels, checkins, sigType, sigPng, sigTyped, signedAt, signedAtIso: signedAt.toISOString(), combo, access,
      via, witness: ctx.tech, ip: ctx.ip, device, conditionAck: !!p.conditionAck && checkins.length > 0,
    });

    const rec = await W.create(token, T.agreements, {
      [AGR.ref]: ref, [AGR.customer]: [d.customer.id], [AGR.boats]: chosen, [AGR.status]: 'Signed', [AGR.season]: SEASON,
      [AGR.signedAt]: signedAt.toISOString(), [AGR.name]: signer.name, [AGR.email]: signer.email, [AGR.phone]: signer.phone || undefined,
      [AGR.address]: signer.address, [AGR.quoteRef]: signer.quoteRef,
      [AGR.vessels]: vessels.map((v, i) => `${i + 1}. ${v.label}${v.hin ? ' | HIN ' + v.hin : ''} | ${v.package}`).join('\n'),
      [AGR.packages]: [...new Set(vessels.map((v) => v.package))],
      [AGR.battery]: vessels.map((v) => `${v.label}: ${v.battery}`).join('\n'),
      [AGR.accessAck]: true, [AGR.accessNotes]: [`Pickup/service location: ${access.address}`, access.notes, ...vessels.map((v) => `${v.label}: winter storage at ${storageOf(v.package)}`)].filter(Boolean).join('\n'),
      [AGR.via]: via, [AGR.witness]: ctx.tech || '', [AGR.sigType]: sigType, [AGR.version]: VERSION, [AGR.sha]: DOCS[combo].sha,
      [AGR.consent]: true, [AGR.conditionAck]: !!p.conditionAck && checkins.length > 0, [AGR.ip]: ctx.ip, [AGR.device]: device,
      [AGR.checkins]: checkins.map((c) => c.id), [AGR.driveStatus]: 'Pending', [AGR.submissionId]: submissionId || undefined,
    });
    const filename = `Waterline-Agreement-${ref}-${signer.name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
    const pdfB64 = Buffer.from(pdfBytes).toString('base64');
    let pdfSaved = true;
    try { await W.uploadAttachment(token, rec.id, AGR.pdf, { data: pdfB64, contentType: 'application/pdf', filename }); }
    catch (e) { pdfSaved = false; console.error('agreement pdf attach', rec.id, e.message); }
    if (sigPng) await W.uploadAttachment(token, rec.id, AGR.signature, { data: sigPng.toString('base64'), contentType: 'image/png', filename: `${ref}-signature.png` }).catch(() => {});
    // Mark the covered check-ins signed.
    for (const c of checkins) {
      const fields = { [CHK.agreement]: [rec.id] };
      if (c.status === 'Awaiting Signature') fields[CHK.status] = 'Signed';
      const v = vessels.find((x) => x.boatId && x.boatId === c.boatId);
      if (v) { fields[CHK.battery] = v.battery; if (!c.package) fields[CHK.package] = v.package; }
      await W.patch(token, T.checkins, c.id, fields).catch((e) => console.error('agreement checkin patch', c.id, e.message));
    }
    // Check-ins still being filled out stay "In Progress" but carry the agreement link;
    // the check-in app flips them to Signed when the tech finishes.
    return { ref, id: rec.id, signedAt: signedAt.toISOString(), pdf: pdfB64, filename, pdfSaved, via };
  },

  async driveCopy(token, p) { return driveCopy(token, p.id); },
};

function boatLabel(b) {
  const main = b.mmc || b.name || 'Boat';
  return [b.year && !String(main).includes(String(b.year)) ? b.year : '', main, b.length ? `${b.length} ft` : ''].filter(Boolean).join(' ').replace(/ (\d+ ft)$/, ', $1');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return W.json(405, { ok: false, error: 'Method not allowed' });
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) { console.error('agreement: AIRTABLE_TOKEN is not set'); return W.json(500, { ok: false, error: 'Server not configured' }); }
  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return W.json(400, { ok: false, error: 'Invalid request' }); }
  const fn = actions[p.action];
  if (!fn) return W.json(400, { ok: false, error: 'Unknown action' });
  const h = event.headers || {};
  const ctx = { tech: h['x-tech-pin'] ? W.techForPin(h['x-tech-pin']) : null, ip: W.clientIp(event), ua: h['user-agent'] || '' };
  try {
    return W.json(200, { ok: true, ...(await fn(token, p, ctx)) });
  } catch (err) {
    console.error('agreement', p.action, err.status, err.message, err.data && JSON.stringify(err.data));
    const status = err.status && err.status < 500 && err.status !== 401 ? err.status : 502;
    return W.json(status, { ok: false, error: err.message || 'Something went wrong' });
  }
};
