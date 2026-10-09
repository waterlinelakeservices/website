// Backend for the staff-only tools at /winterize (check-in and winterization).
//
// Every request must carry a tech PIN in the `x-tech-pin` header. PINs live in
// the WINTERIZE_PINS environment variable on the Netlify project, formatted as
//   Name:PIN,Name:PIN      e.g.  Brian:######,Ben:######
// Changing a PIN takes effect after the next deploy (Deploys -> Trigger deploy).
//
// Everything is keyed to the boat's HIN. A job or check-in is always attached
// to a Boat record: if no Boat has this HIN yet, the app creates one under the
// customer (and creates the customer too if they're new).
//
// Tables in the Waterline Marketing base:
//   Check-ins            one row per boat check-in (condition, photos, agreement link)
//   Winterization Jobs   one row per boat per season (checklist state + summary)
//   Winterization Photos one row per photo (check-in or job), image as attachment
//   Boats / Customers    HIN, engine, hours, service dates written back
//
// Requires AIRTABLE_TOKEN with data.records:read and data.records:write.

const W = require('./_wl');
const { T, CUST, BOAT, CHK, AGR, PHOTO } = W;

const JOB = {
  title: 'fldbOKhHgP76OppgA', boat: 'fldy6IAbehJhCLvB5', customer: 'fldaClMCLegvwjpMB',
  status: 'fldYyZSh48cEu4pzU', svc: 'fldXqff4Og5277L6s', hin: 'fldnCvqDFj5YUcUKi',
  tech: 'fldWf6Iqeft8IlKZ8', reviewer: 'fldxb4qH1l0dCFDUM', dateIn: 'fldDpyXRuP0a786Gv',
  dateDone: 'fldgATvvSC5eJl29Q', hours: 'fldqVChE5mX39L6FE', volts: 'fldH0nGKv5OWXxBWQ',
  coolant: 'fldtMoLXFdLkVXx1b', af: 'fldSY2rQTkExmPEOW', fuel: 'fldWfqRezAmDdzWJJ',
  impeller: 'fldIpDckFcvpr1qr7', steps: 'fldhltVO1xLS9t5Tj', log: 'fldrZjSOmRn8LDD1s',
  parts: 'fld3dOIItXnniTtbB', recs: 'fldE6IY6k3rCVhHrM', quote: 'fldqe1JoLVq9raKeR',
  removed: 'fld4KOsv13cv1ds7x', spring: 'fldbh75LnHQ21dzOb', photoCount: 'fldHW2c7dq3uPpAKx',
  labor: 'fldmvOx3tg0UZaHLi', report: 'fldHgTTb02Rttsmpu', appId: 'fldPKCFL95xnmphNC',
  synced: 'fldWX6YGNAQlZsWz3', state: 'fld99YXrMOI1bffP6', techSig: 'fldf8EIrncWCzLJgE',
  revSig: 'fldoL0vJAGjoz44WP', reportPdf: 'fldZuXn3XU0X6juv5', customerName: 'fldBTJl9foiFFaxpb',
  photos: 'fldp2r5d1G0Fym19m', checkin: 'fldlZRa0a9inODyyL', override: 'fldqRZbRTziqEai5l',
  stage: 'fldtjMwsbZJrj18ja', share: 'fldFVrospGz4BkcY7',
};

const STATUSES = ['In Progress', 'Awaiting Review', 'Complete'];
const SVC = ['Direct Drive', 'V-Drive', 'Inboard/Outboard', 'Pontoon', 'Outboard boat', 'PWC'];
const COOLING = ['Raw-water', 'Closed (freshwater)'];
const WHERE = ["Customer's lift or dock", "Customer's property", 'Picked up by Waterline', 'Dropped off by owner'];
const FUEL = ['Empty', '1/4', '1/2', '3/4', 'Full'];
const MAX_B64 = 5.4 * 1024 * 1024; // Airtable caps uploads at 5 MB
const { str, num, date, recId, pick, sel, esc } = W;
const normHin = (h) => str(h, 40).toUpperCase().replace(/^US[-\s]?/, '').replace(/[^A-Z0-9]/g, '');

// ---------- shared lookups ----------
async function boatByHin(token, hin) {
  if (!hin || hin.length < 5) return null;
  const recs = await W.list(token, T.boats, { formula: `{HIN}="${esc(hin)}"`, fields: W.BOAT_READ, max: 3 });
  return recs.length ? W.boatOut(recs[0]) : null;
}
async function customerById(token, id) {
  return id ? W.customerOut(await W.getRec(token, T.customers, id)) : null;
}
function agreementOut(a) {
  const f = a.fields || {};
  const pdf = (f[AGR.pdf] || [])[0];
  return {
    id: a.id, ref: f[AGR.ref] || '', signedAt: f[AGR.signedAt] || '', via: sel(f[AGR.via]), witness: f[AGR.witness] || '',
    signer: f[AGR.name] || '', driveLink: f[AGR.driveLink] || '', driveStatus: f[AGR.driveStatus] || '', pdfUrl: pdf ? pdf.url : null,
  };
}
// The signed agreement (this season) that covers a boat, if any.
async function coverageFor(token, customerId, boatId) {
  if (!customerId || !boatId) return null;
  const c = await W.getRec(token, T.customers, customerId);
  const ids = c.fields[CUST.agreements] || [];
  if (!ids.length) return null;
  const season = W.seasonFor();
  const recs = await W.byIds(token, T.agreements, ids);
  const hit = recs
    .filter((a) => sel(a.fields[AGR.status]) === 'Signed' && a.fields[AGR.season] === season && (a.fields[AGR.boats] || []).includes(boatId))
    .sort((a, b) => String(b.fields[AGR.signedAt]).localeCompare(String(a.fields[AGR.signedAt])))[0];
  return hit ? agreementOut(hit) : null;
}
function photoOut(r) {
  const f = r.fields || {};
  const att = (f[PHOTO.photo] || [])[0];
  return {
    id: r.id, item: f[PHOTO.stepId] || '', sec: f[PHOTO.section] || '', cap: f[PHOTO.caption] || '',
    by: f[PHOTO.by] || '', at: f[PHOTO.at] ? Date.parse(f[PHOTO.at]) : Date.parse(r.createdTime),
    thumb: W.attUrl(att, 'large'), url: att ? att.url : null,
  };
}
// Latest check-in this season for a HIN (and boat, if known).
async function checkinForBoat(token, boatId, hin) {
  if (!hin || hin.length < 5) return null;
  const season = W.seasonFor();
  const recs = await W.list(token, T.checkins, {
    formula: `AND({Season}="${season}", {HIN}="${esc(hin)}")`,
    fields: [CHK.status, CHK.at, CHK.agreement, CHK.boat, CHK.by, CHK.title], sort: [{ field: CHK.at, direction: 'desc' }], max: 5,
  });
  const r = recs.find((x) => !boatId || (x.fields[CHK.boat] || []).includes(boatId)) || recs[0];
  if (!r) return null;
  return { id: r.id, status: sel(r.fields[CHK.status]) || 'In Progress', at: r.fields[CHK.at] || '', by: r.fields[CHK.by] || '', title: r.fields[CHK.title] || '', signed: !!(r.fields[CHK.agreement] || []).length };
}

// Keep every photo of a check-in (and of its winterization jobs) on the
// check-in's current boat, and the jobs on the same boat and customer.
async function relinkPhotos(token, cur, boatId) {
  const f = cur.fields || {};
  let ids = [...(f[CHK.photos] || [])];
  const jobIds = f[CHK.jobs] || [];
  const jobs = jobIds.length ? await W.byIds(token, T.jobs, jobIds, [JOB.photos, JOB.boat]) : [];
  jobs.forEach((j) => { ids = ids.concat(j.fields[JOB.photos] || []); });
  // Only touch photos whose boat link is actually wrong.
  const photos = ids.length ? await W.byIds(token, T.photos, ids, [PHOTO.boat]) : [];
  const wrong = photos.filter((ph) => ((ph.fields[PHOTO.boat] || [])[0] || null) !== boatId).map((ph) => ph.id);
  if (wrong.length) await W.patchMany(token, T.photos, wrong, { [PHOTO.boat]: boatId ? [boatId] : [] });
}

// ---------- field mapping ----------
function jobSummaryFields(s, tech) {
  s = s || {};
  const f = {
    [JOB.title]: str(s.title, 250) || 'Winterization', [JOB.status]: pick(s.status, STATUSES), [JOB.svc]: pick(s.svc, SVC),
    [JOB.hin]: normHin(s.hin), [JOB.tech]: str(s.tech || tech, 120), [JOB.reviewer]: str(s.reviewer, 120),
    [JOB.dateIn]: date(s.dateIn), [JOB.dateDone]: date(s.dateDone),
    [JOB.hours]: num(s.hours), [JOB.volts]: num(s.volts), [JOB.coolant]: num(s.coolant), [JOB.af]: num(s.af),
    [JOB.fuel]: num(s.fuel), [JOB.labor]: num(s.labor), [JOB.impeller]: str(s.impeller, 120), [JOB.steps]: str(s.steps, 40),
    [JOB.log]: str(s.log), [JOB.parts]: str(s.parts), [JOB.recs]: str(s.recs), [JOB.quote]: !!s.quote,
    [JOB.removed]: str(s.removed), [JOB.spring]: str(s.spring), [JOB.photoCount]: num(s.photoCount), [JOB.report]: !!s.report,
    [JOB.override]: str(s.checkinOverride, 250), [JOB.synced]: new Date().toISOString(),
  };
  Object.keys(f).forEach((k) => f[k] === undefined && delete f[k]);
  return f;
}
function boatFields(b) {
  b = b || {};
  const f = {};
  if (b.hin && normHin(b.hin).length >= 5) f[BOAT.hin] = normHin(b.hin);
  if (num(b.year)) f[BOAT.year] = num(b.year);
  if (b.engine) f[BOAT.engine] = str(b.engine, 250);
  if (pick(b.svc, SVC)) f[BOAT.svc] = b.svc;
  if (pick(b.cooling, COOLING)) f[BOAT.cooling] = b.cooling;
  if (b.profile) f[BOAT.profile] = str(b.profile, 120);
  if (num(b.hours) != null) f[BOAT.hours] = num(b.hours);
  if (b.mmc) f[BOAT.mmc] = str(b.mmc, 250);
  if (num(b.length) != null) f[BOAT.length] = num(b.length);
  if (date(b.lastWint)) f[BOAT.lastWint] = b.lastWint;
  if (date(b.impDate)) f[BOAT.impDate] = b.impDate;
  // Engine details recorded at check-in
  if (pick(b.engineMake, W.ENGINE_MAKES)) f[BOAT.engineMake] = b.engineMake;
  if (pick(b.driveType, W.DRIVE_TYPES)) f[BOAT.driveType] = b.driveType;
  if (str(b.engineModel, 120).trim()) f[BOAT.engineModel] = str(b.engineModel, 120).trim();
  if (num(b.hp) != null && num(b.hp) > 0) f[BOAT.hp] = num(b.hp);
  if (str(b.oilFilter, 80).trim()) f[BOAT.oilFilter] = str(b.oilFilter, 80).trim();
  return f;
}
const linkFields = (state, boatF, custF) => {
  const b = state && state.boat && recId(state.boat.id);
  const c = state && state.customer && recId(state.customer.id);
  return { [boatF]: b ? [b] : [], [custF]: c ? [c] : [] };
};
function checkinFields(s, st, tech) {
  s = s || {};
  const f = {
    [CHK.title]: str(s.title, 250) || 'Check-in', [CHK.hin]: normHin(st.hin), [CHK.season]: st.season || W.seasonFor(),
    [CHK.by]: str(st.checkedInBy || tech, 120), [CHK.where]: pick(st.where, WHERE) || null,
    [CHK.hours]: num(st.engineHours), [CHK.fuel]: pick(st.fuel, FUEL) || null,
    [CHK.damage]: st.noDamage ? 'None visible at check-in' : str(st.damage), [CHK.items]: str(st.items), [CHK.keys]: str(st.keys, 250),
    [CHK.notes]: str(st.notes), [CHK.photoCount]: num(s.photoCount),
    [CHK.overrideReason]: str(st.override && st.override.reason, 250), [CHK.overrideBy]: str(st.override && st.override.by, 120),
    [CHK.synced]: new Date().toISOString(), [CHK.package]: pick(st.package, W.PKG_NAMES) || null, [CHK.sharePhotos]: st.sharePhotos !== false,
  };
  if (st.checkedInAt) f[CHK.at] = new Date(st.checkedInAt).toISOString();
  return f;
}

// ---------- actions ----------
const actions = {
  async login(_, tech) { return { tech, season: W.seasonFor() }; },

  // ---- customers & boats ----
  async searchCustomers(token, tech, p) {
    const q = str(p.q, 80).trim().toLowerCase();
    if (!q) return { customers: [] };
    const recs = await W.list(token, T.customers, { formula: `SEARCH("${esc(q)}", LOWER({Name}&" "&{Phone}&" "&{Email}))`, fields: W.CUST_READ, max: 12 });
    return { customers: recs.map(W.customerOut) };
  },
  async customerBoats(token, tech, p) {
    const recs = await W.byIds(token, T.boats, (p.ids || []).slice(0, 40), W.BOAT_READ);
    return { boats: recs.map(W.boatOut) };
  },
  async createCustomer(token, tech, p) {
    const name = str(p.name, 120).trim();
    if (name.length < 2) throw W.fail(400, 'Customer name is required');
    // Reuse an existing customer with the same email or phone instead of creating a duplicate.
    const email = str(p.email, 160).trim().toLowerCase();
    const digits = str(p.phone, 40).replace(/[^0-9]/g, '').slice(-10);
    const tests = [];
    if (/^\S+@\S+\.\S+$/.test(email)) tests.push(`LOWER(TRIM({Email}&""))="${esc(email)}"`);
    if (digits.length === 10) tests.push(`RIGHT(REGEX_REPLACE({Phone}&"", "[^0-9]", ""), 10)="${digits}"`);
    if (tests.length) {
      const hit = await W.list(token, T.customers, { formula: tests.length > 1 ? `OR(${tests.join(', ')})` : tests[0], fields: W.CUST_READ, max: 1 });
      if (hit.length) return { customer: W.customerOut(hit[0]), existing: true };
    }
    const rec = await W.create(token, T.customers, {
      [CUST.name]: name, [CUST.phone]: str(p.phone, 40).trim() || undefined, [CUST.email]: str(p.email, 160).trim() || undefined, [CUST.address]: str(p.address, 250).trim(), [CUST.portalKey]: W.newPortalKey(),
    });
    return { customer: W.customerOut(rec) };
  },
  // Create (or return) the Boat record for a HIN under a customer.
  async ensureBoat(token, tech, p) {
    const hin = normHin(p.hin);
    const customerId = recId(p.customerId);
    if (!customerId) throw W.fail(400, 'Customer is required');
    if (hin.length >= 5) {
      const existing = await boatByHin(token, hin);
      if (existing) {
        if (existing.custIds.length && !existing.custIds.includes(customerId)) throw W.fail(409, `HIN ${hin} is already on another customer's boat in Airtable. Check the HIN, or fix the boat record in Airtable.`);
        if (!existing.custIds.length) await W.patch(token, T.boats, existing.id, { [BOAT.customer]: [customerId] });
        return { boat: { ...existing, custIds: [customerId] }, created: false };
      }
    }
    const name = str(p.name || p.mmc, 120).trim() || 'Boat';
    const rec = await W.create(token, T.boats, {
      [BOAT.name]: name, [BOAT.customer]: [customerId], [BOAT.hin]: hin || undefined, [BOAT.mmc]: str(p.mmc, 250) || undefined,
      [BOAT.length]: num(p.length), [BOAT.year]: num(p.year),
    });
    return { boat: W.boatOut(rec), created: true };
  },
  // Put a HIN on a Boat record the customer already has.
  async setBoatHin(token, tech, p) {
    const id = recId(p.boatId); const hin = normHin(p.hin);
    if (!id || hin.length < 5) throw W.fail(400, 'Boat and HIN are required');
    const other = await boatByHin(token, hin);
    if (other && other.id !== id) throw W.fail(409, `HIN ${hin} is already on another boat record ("${other.name}"). Pick that boat instead, or fix it in Airtable.`);
    const rec = await W.patch(token, T.boats, id, { [BOAT.hin]: hin });
    return { boat: W.boatOut(rec) };
  },

  // Fix a mistyped HIN on a check-in. Updates the check-in, its boat record, and any
  // winterization job started from it, and logs who changed it, from what, and why.
  async correctHin(token, tech, p) {
    const id = recId(p.checkinId); const hin = normHin(p.hin); const reason = str(p.reason, 200).trim();
    if (!id) throw W.fail(400, 'Bad check-in id');
    if (hin.length < 5) throw W.fail(400, 'Enter the corrected HIN (at least 5 letters and numbers).');
    const cur = await W.getRec(token, T.checkins, id);
    const f = cur.fields || {};
    let st = {}; try { st = JSON.parse(f[CHK.state] || '{}') || {}; } catch (e) { st = {}; }
    const old = normHin(f[CHK.hin] || st.hin || '');
    if (old === hin) return { hin, unchanged: true, state: st };
    const boatId = (f[CHK.boat] || [])[0] || null;
    // The corrected HIN can't belong to a different boat...
    const other = await boatByHin(token, hin);
    if (other && other.id !== boatId) throw W.fail(409, `HIN ${hin} is already on another boat record ("${other.name}"${other.custIds && other.custIds.length ? '' : ', no customer'}). If that's this boat, remove this check-in and check that boat in instead.`);
    // ...or to another open check-in this season.
    const season = f[CHK.season] || W.seasonFor();
    const dup = await W.list(token, T.checkins, {
      formula: `AND({Season}="${esc(season)}", {HIN}="${esc(hin)}", OR({Status}="In Progress", {Status}="Awaiting Signature"))`, fields: [CHK.title], max: 2,
    });
    if (dup.some((r) => r.id !== id)) throw W.fail(409, `Another open check-in already uses HIN ${hin} ("${dup.find((r) => r.id !== id).fields[CHK.title] || 'check-in'}").`);
    if (boatId) await W.patch(token, T.boats, boatId, { [BOAT.hin]: hin });
    const change = { from: old, to: hin, by: tech, at: Date.now(), reason };
    st.hin = hin; st.hinHistory = [...(st.hinHistory || []), change]; st.updatedAt = Date.now();
    if (st.boat) st.boat.hin = hin;
    const title = String(f[CHK.title] || '').split(old).join(hin);
    await W.patch(token, T.checkins, id, { [CHK.hin]: hin, [CHK.state]: str(JSON.stringify(st)), [CHK.title]: title || undefined });
    // Winterization jobs started from this check-in carry the HIN too.
    for (const jid of f[CHK.jobs] || []) {
      const j = await W.getRec(token, T.jobs, jid);
      let js = null; try { js = JSON.parse(j.fields[JOB.state] || 'null'); } catch (e) { js = null; }
      const jf = { [JOB.hin]: hin };
      if (js) { js.hin = hin; js.updatedAt = Date.now(); jf[JOB.state] = str(JSON.stringify(js)); }
      const jt = String(j.fields[JOB.title] || ''); if (jt.includes(old)) jf[JOB.title] = jt.split(old).join(hin);
      await W.patch(token, T.jobs, jid, jf);
    }
    console.log('winterize correctHin', id, old, '->', hin, 'by', tech, reason ? `(${reason})` : '');
    return { hin, state: st, signed: !!(f[CHK.agreement] || []).length, jobs: (f[CHK.jobs] || []).length };
  },

  // Save an oil filter part # (entered on a checklist oil step) to the boat's record.
  async setOilFilter(token, tech, p) {
    const id = recId(p.boatId); const part = str(p.part, 80).trim();
    if (!id || !part) throw W.fail(400, 'Boat and part # required');
    await W.patch(token, T.boats, id, { [BOAT.oilFilter]: part });
    return { ok: true, part };
  },

  // ---- check-ins ----
  async listCheckins(token) {
    const season = W.seasonFor();
    const recs = await W.list(token, T.checkins, {
      formula: `{Season}="${season}"`, fields: [CHK.title, CHK.hin, CHK.status, CHK.at, CHK.by, CHK.photoCount, CHK.agreement],
      sort: [{ field: CHK.at, direction: 'desc' }], max: 200,
    });
    return {
      season,
      checkins: recs.map((r) => ({ id: r.id, title: r.fields[CHK.title] || '', hin: r.fields[CHK.hin] || '', status: sel(r.fields[CHK.status]) || 'In Progress', at: r.fields[CHK.at] || '', by: r.fields[CHK.by] || '', photos: r.fields[CHK.photoCount] || 0, signed: !!(r.fields[CHK.agreement] || []).length })),
    };
  },
  async checkinPrefill(token, tech, p) {
    const hin = normHin(p.hin);
    const boat = await boatByHin(token, hin);
    const customer = boat && boat.custIds[0] ? await customerById(token, boat.custIds[0]) : null;
    const last = await checkinForBoat(token, boat && boat.id, hin);
    const coverage = boat && customer ? await coverageFor(token, customer.id, boat.id) : null;
    const packageGuess = customer ? await W.packageGuess(token, customer.quotes, boat && boat.id).catch(() => '') : '';
    return { boat, customer, openCheckin: last && ['In Progress', 'Awaiting Signature'].includes(last.status) ? last : null, lastCheckin: last, coverage, season: W.seasonFor(), packageGuess };
  },
  // Every boat this customer has checked in this season that isn't signed for yet,
  // i.e. the boats one signature will cover, plus their other boats in Airtable.
  async visit(token, tech, p) {
    const cid = recId(p.customerId); if (!cid) throw W.fail(400, 'Bad customer id');
    const c = await W.getRec(token, T.customers, cid);
    const f = c.fields || {};
    const season = W.seasonFor();
    const cks = (await W.byIds(token, T.checkins, f[CUST.checkins] || [], [CHK.title, CHK.status, CHK.hin, CHK.boat, CHK.season, CHK.package, CHK.photoCount, CHK.state, CHK.agreement]))
      .filter((r) => r.fields[CHK.season] === season)
      .map((r) => {
        const x = r.fields; let st = {}; try { st = JSON.parse(x[CHK.state] || '{}') || {}; } catch (e) {}
        return { id: r.id, status: sel(x[CHK.status]) || 'In Progress', hin: x[CHK.hin] || '', boatId: (x[CHK.boat] || [])[0] || null,
          boat: st.boat ? { name: st.boat.name, mmc: st.boat.mmc, length: st.boat.length, year: st.boat.year } : null,
          package: sel(x[CHK.package]), photos: x[CHK.photoCount] || 0, completed: !!st.completedAt, signed: !!(x[CHK.agreement] || []).length };
      });
    const boats = (await W.byIds(token, T.boats, f[CUST.boats] || [], W.BOAT_READ)).map(W.boatOut);
    const packageGuess = await W.packageGuess(token, f[CUST.quotes] || [], null).catch(() => '');
    return { checkins: cks, boats, packageGuess };
  },
  // The private link a customer uses to sign (and, later, to see their boat profile).
  async customerLink(token, tech, p) {
    const cid = recId(p.customerId); if (!cid) throw W.fail(400, 'Bad customer id');
    const c = await W.getRec(token, T.customers, cid);
    const key = await W.ensurePortalKey(token, cid, c.fields[CUST.portalKey]);
    return { url: W.agreementUrl(key) };
  },
  async createCheckin(token, tech, p) {
    const st = p.state || {};
    const hin = normHin(st.hin);
    if (hin.length >= 5) {
      const open = await W.list(token, T.checkins, {
        formula: `AND({Season}="${esc(st.season || W.seasonFor())}", {HIN}="${esc(hin)}", OR({Status}="In Progress", {Status}="Awaiting Signature"))`,
        fields: [CHK.status], max: 1,
      });
      if (open.length) return { id: open[0].id, existing: true };
    }
    const rec = await W.create(token, T.checkins, {
      ...checkinFields(p.summary, st, tech), ...linkFields(st, CHK.boat, CHK.customer),
      [CHK.status]: 'In Progress', [CHK.state]: str(JSON.stringify(st)),
    });
    return { id: rec.id };
  },
  async getCheckin(token, tech, p) {
    const id = recId(p.id); if (!id) throw W.fail(400, 'Bad check-in id');
    const r = await W.getRec(token, T.checkins, id);
    const f = r.fields || {};
    let state = null; try { state = JSON.parse(f[CHK.state] || 'null'); } catch (e) {}
    const photos = (await W.byIds(token, T.photos, f[CHK.photos] || [])).map(photoOut);
    const agrIds = f[CHK.agreement] || [];
    let agreement = agrIds.length ? agreementOut(await W.getRec(token, T.agreements, agrIds[0])) : null;
    if (!agreement && state && state.customer && state.boat) agreement = await coverageFor(token, recId(state.customer.id), recId(state.boat.id));
    const boatId = (f[CHK.boat] || [])[0];
    // The Boat record is the source of truth for the Boat Profile (engine details can be edited in Airtable).
    const liveBoat = boatId ? await W.getRec(token, T.boats, boatId).then(W.boatOut).catch(() => null) : null;
    return { id, state, photos, status: sel(f[CHK.status]) || 'In Progress', agreement, jobId: (f[CHK.jobs] || []).slice(-1)[0] || null, stage: f[CHK.stage] || '', battery: f[CHK.battery] || '', boat: liveBoat };
  },
  async saveCheckin(token, tech, p) {
    const id = recId(p.id); if (!id) throw W.fail(400, 'Bad check-in id');
    const st = p.state || {};
    const cur = await W.getRec(token, T.checkins, id);
    let agrIds = cur.fields[CHK.agreement] || [];
    // Pick up a signed agreement that already covers this boat this season.
    if (!agrIds.length && st.customer && st.boat) {
      const cov = await coverageFor(token, recId(st.customer.id), recId(st.boat.id));
      if (cov) agrIds = [cov.id];
    }
    let status = 'In Progress';
    if (st.completedAt) status = agrIds.length ? 'Signed' : (st.override && st.override.reason ? 'Override' : 'Awaiting Signature');
    await W.patch(token, T.checkins, id, {
      ...checkinFields(p.summary, st, tech), ...linkFields(st, CHK.boat, CHK.customer),
      [CHK.agreement]: agrIds, [CHK.status]: status, [CHK.state]: str(JSON.stringify(st)),
    });
    const boatId = st.boat && recId(st.boat.id);
    if (boatId) { const bf = boatFields(p.boat); if (Object.keys(bf).length) await W.patch(token, T.boats, boatId, bf); }
    // Re-point photos when the boat changes, and once more when the check-in is completed
    // (catches a photo that uploaded in the moment before the boat was linked).
    const prevBoat = (cur.fields[CHK.boat] || [])[0] || null;
    if (prevBoat !== boatId || (st.completedAt && sel(cur.fields[CHK.status]) === 'In Progress')) await relinkPhotos(token, cur, boatId);
    const agreement = agrIds.length ? agreementOut(await W.getRec(token, T.agreements, agrIds[0])) : null;
    return { status, agreement, savedAt: Date.now() };
  },

  // ---- Boat Profile: everything about a customer's boats, for the profile page ----
  // Returns the customer and ALL of their boats (so the page can switch between them),
  // each with its engine details, check-ins, signed agreements, and winterization jobs.
  async boatProfile(token, tech, p) {
    const focus = recId(p.boatId); if (!focus) throw W.fail(400, 'Bad boat id');
    const fb = await W.getRec(token, T.boats, focus);
    const custId = (fb.fields[BOAT.customer] || [])[0] || null;
    const cust = custId ? await W.getRec(token, T.customers, custId).catch(() => null) : null;
    const boatIds = cust ? (cust.fields[CUST.boats] || []) : [focus];
    if (!boatIds.includes(focus)) boatIds.unshift(focus);
    const BREAD = [...W.BOAT_READ, BOAT.hours, BOAT.lastWint, BOAT.impDate, BOAT.checkins];
    const boats = await W.byIds(token, T.boats, boatIds, BREAD);
    const ckIds = boats.flatMap((b) => b.fields[BOAT.checkins] || []);
    const cks = ckIds.length ? await W.byIds(token, T.checkins, ckIds, [CHK.boat, CHK.status, CHK.season, CHK.at, CHK.by, CHK.package, CHK.stage, CHK.state, CHK.agreement,
      CHK.battery, CHK.partsNotes, CHK.partsStatus, CHK.photos, CHK.where, CHK.hours, CHK.fuel, CHK.damage, CHK.items, CHK.keys]) : [];
    const agrIds = [...new Set(cks.flatMap((c) => c.fields[CHK.agreement] || []))];
    const agrs = agrIds.length ? await W.byIds(token, T.agreements, agrIds, [AGR.ref, AGR.signedAt, AGR.status]) : [];
    const agrById = new Map(agrs.map((a) => [a.id, { ref: a.fields[AGR.ref] || '', signedAt: a.fields[AGR.signedAt] || '', status: sel(a.fields[AGR.status]) }]));
    const hins = boats.map((b) => normHin(b.fields[BOAT.hin] || '')).filter((h) => h.length >= 5);
    const jobs = hins.length ? await W.list(token, T.jobs, {
      formula: `OR(${hins.map((h) => `{HIN}="${esc(h)}"`).join(',')})`,
      fields: [JOB.boat, JOB.hin, JOB.status, JOB.svc, JOB.dateIn, JOB.dateDone, JOB.hours, JOB.recs, JOB.report, JOB.share, JOB.tech, JOB.spring], max: 100,
    }) : [];
    // One side or bow photo per boat (newest check-in) for the profile circle.
    const photoFor = new Map();
    for (const b of boats) {
      const mine = cks.filter((c) => (c.fields[CHK.boat] || [])[0] === b.id).sort((x, y) => String(y.fields[CHK.at] || '').localeCompare(String(x.fields[CHK.at] || '')));
      const ids = mine.length ? (mine[0].fields[CHK.photos] || []) : [];
      if (!ids.length) continue;
      const ph = await W.byIds(token, T.photos, ids.slice(0, 30), [PHOTO.stepId, PHOTO.photo]).catch(() => []);
      const pick = ['port', 'stbd', 'bow', 'stern'].map((k) => ph.find((x) => x.fields[PHOTO.stepId] === k)).find(Boolean);
      if (pick) photoFor.set(b.id, W.attUrl((pick.fields[PHOTO.photo] || [])[0], 'large'));
    }
    const out = boats.map((r) => {
      const f = r.fields || {}; const b = W.boatOut(r); const hin = normHin(f[BOAT.hin] || '');
      return { ...b, lastHours: f[BOAT.hours] || '', lastWint: f[BOAT.lastWint] || '', impDate: f[BOAT.impDate] || '', photo: photoFor.get(r.id) || '',
        checkins: cks.filter((c) => (c.fields[CHK.boat] || [])[0] === r.id).map((c) => {
          const x = c.fields; let st = {}; try { st = JSON.parse(x[CHK.state] || '{}') || {}; } catch (e) {}
          const ag = (x[CHK.agreement] || []).map((id) => agrById.get(id)).filter(Boolean)[0] || null;
          return { id: c.id, season: x[CHK.season] || '', at: x[CHK.at] || '', by: x[CHK.by] || '', status: sel(x[CHK.status]), package: sel(x[CHK.package]), stage: x[CHK.stage] || '',
            where: sel(x[CHK.where]) || st.where || '', hours: x[CHK.hours] || (st.engineHours === 'N/A' ? 'N/A' : ''), fuel: sel(x[CHK.fuel]) || (st.fuel === 'N/A' ? 'N/A' : ''),
            damage: st.noDamage ? 'None visible at check-in' : (x[CHK.damage] || ''), items: x[CHK.items] || '', keys: x[CHK.keys] || '', battery: x[CHK.battery] || '',
            partsNotes: x[CHK.partsNotes] || '', partsStatus: sel(x[CHK.partsStatus]), photos: (x[CHK.photos] || []).length, agreement: ag };
        }).sort((a, z) => String(z.at).localeCompare(String(a.at))),
        jobs: jobs.filter((j) => (j.fields[JOB.boat] || [])[0] === r.id || normHin(j.fields[JOB.hin] || '') === hin).map((j) => {
          const x = j.fields; const rep = (x[JOB.report] || [])[0];
          return { id: j.id, status: sel(x[JOB.status]) || 'In Progress', svc: sel(x[JOB.svc]), dateIn: x[JOB.dateIn] || '', dateDone: x[JOB.dateDone] || '',
            hours: x[JOB.hours] || '', recs: x[JOB.recs] || '', spring: x[JOB.spring] || '', reportUrl: rep ? rep.url : '', share: !!x[JOB.share], tech: x[JOB.tech] || '' };
        }).sort((a, z) => String(z.dateIn).localeCompare(String(a.dateIn))) };
    });
    return { focus, customer: cust ? W.customerOut(cust) : null, boats: out };
  },

  // ---- the jobs board: one card per boat in service ----
  // Joins this season's check-ins with winterization jobs. Stage comes from the
  // Stage formula fields in Airtable, so the board and Airtable always agree.
  async listBoard(token) {
    const season = W.seasonFor();
    const [cks, jobs] = await Promise.all([
      W.list(token, T.checkins, {
        formula: `{Season}="${season}"`,
        fields: [CHK.title, CHK.hin, CHK.status, CHK.at, CHK.by, CHK.photoCount, CHK.jobs, CHK.stage, CHK.synced, CHK.package],
        sort: [{ field: CHK.at, direction: 'desc' }], max: 300,
      }),
      W.list(token, T.jobs, {
        fields: [JOB.title, JOB.hin, JOB.status, JOB.steps, JOB.dateIn, JOB.customerName, JOB.svc, JOB.synced, JOB.checkin, JOB.stage, JOB.photoCount],
        sort: [{ field: JOB.synced, direction: 'desc' }], max: 300,
      }),
    ]);
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    const used = new Set();
    const part = (t, i) => (String(t || '').split(' - ')[i] || '').trim();
    const jobOut = (j) => {
      const f = j.fields || {};
      return { id: j.id, status: sel(f[JOB.status]) || 'In Progress', steps: f[JOB.steps] || '', svc: sel(f[JOB.svc]) || '', photos: f[JOB.photoCount] || 0, customer: (f[JOB.customerName] || [])[0] || part(f[JOB.title], 1), boat: part(f[JOB.title], 2), at: f[JOB.synced] || '', dateIn: f[JOB.dateIn] || '' };
    };
    const items = [];
    for (const c of cks) {
      const f = c.fields || {};
      const linked = (f[CHK.jobs] || []).map((id) => jobById.get(id)).filter(Boolean)
        .sort((a, b) => String(b.fields[JOB.synced] || '').localeCompare(String(a.fields[JOB.synced] || '')));
      linked.forEach((j) => used.add(j.id));
      const job = linked[0] ? jobOut(linked[0]) : null;
      items.push({
        checkinId: c.id, jobId: job ? job.id : null, hin: f[CHK.hin] || '', stage: f[CHK.stage] || 'Checking in',
        customer: (job && job.customer) || part(f[CHK.title], 1), boat: part(f[CHK.title], 2) || (job && job.boat) || '',
        checkin: { status: sel(f[CHK.status]) || 'In Progress', at: f[CHK.at] || '', by: f[CHK.by] || '', photos: f[CHK.photoCount] || 0 }, package: sel(f[CHK.package]),
        job, updated: [f[CHK.synced], f[CHK.at], job && job.at].filter(Boolean).sort().pop() || '',
      });
    }
    for (const j of jobs) {
      if (used.has(j.id)) continue;
      const f = j.fields || {};
      const job = jobOut(j);
      items.push({ checkinId: (f[JOB.checkin] || [])[0] || null, jobId: j.id, hin: f[JOB.hin] || '', stage: f[JOB.stage] || 'In winterization',
        customer: job.customer, boat: job.boat, checkin: null, job, updated: job.at || '' });
    }
    items.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    return { season, items };
  },
  // Remove a winterization job and/or a check-in, with their photos.
  // Customers, boats, and signed agreements are never deleted here.
  async removeItem(token, tech, p) {
    const jobId = p.jobId ? recId(p.jobId) : null, checkinId = p.checkinId ? recId(p.checkinId) : null;
    if ((p.jobId && !jobId) || (p.checkinId && !checkinId) || (!jobId && !checkinId)) throw W.fail(400, 'Bad id');
    const out = { jobDeleted: false, checkinDeleted: false, photosDeleted: 0 };
    if (jobId) {
      const r = await W.getRec(token, T.jobs, jobId);
      out.photosDeleted += await W.delMany(token, T.photos, r.fields[JOB.photos] || []);
      await W.del(token, T.jobs, jobId); out.jobDeleted = true;
      console.log('winterize removeItem: job', jobId, r.fields[JOB.title], 'by', tech);
    }
    if (checkinId) {
      const r = await W.getRec(token, T.checkins, checkinId);
      out.photosDeleted += await W.delMany(token, T.photos, r.fields[CHK.photos] || []);
      await W.del(token, T.checkins, checkinId); out.checkinDeleted = true;
      console.log('winterize removeItem: check-in', checkinId, r.fields[CHK.title], 'by', tech);
    }
    return out;
  },

  // ---- winterization jobs ----
  async listJobs(token) {
    const recs = await W.list(token, T.jobs, {
      fields: [JOB.title, JOB.hin, JOB.status, JOB.steps, JOB.dateIn, JOB.customerName, JOB.svc, JOB.synced],
      sort: [{ field: JOB.synced, direction: 'desc' }], max: 150,
    });
    return {
      jobs: recs.map((r) => {
        const f = r.fields || {};
        return {
          id: r.id, title: f[JOB.title] || '', hin: f[JOB.hin] || '', status: sel(f[JOB.status]) || 'In Progress',
          steps: f[JOB.steps] || '', dateIn: f[JOB.dateIn] || '', customer: (f[JOB.customerName] || [])[0] || '', svc: sel(f[JOB.svc]),
        };
      }),
    };
  },
  async getJob(token, tech, p) {
    const id = recId(p.id); if (!id) throw W.fail(400, 'Bad job id');
    const r = await W.getRec(token, T.jobs, id);
    const f = r.fields || {};
    let state = null;
    try { state = JSON.parse(f[JOB.state] || 'null'); } catch (e) { state = null; }
    const photos = (await W.byIds(token, T.photos, f[JOB.photos] || [])).map(photoOut);
    let history = [];
    const hin = f[JOB.hin];
    if (hin) {
      const prev = await W.list(token, T.jobs, {
        formula: `AND({HIN}="${esc(hin)}", RECORD_ID()!="${id}")`,
        fields: [JOB.title, JOB.status, JOB.dateIn, JOB.hours, JOB.impeller, JOB.recs], sort: [{ field: JOB.dateIn, direction: 'desc' }], max: 10,
      });
      history = prev.map((x) => ({ id: x.id, status: sel(x.fields[JOB.status]), dateIn: x.fields[JOB.dateIn] || '', hours: x.fields[JOB.hours] || '', impeller: x.fields[JOB.impeller] || '', recs: x.fields[JOB.recs] || '' }));
    }
    // The boat's engine details (for the oil filter prompt); the Boat record is the source of truth.
    const jb = (f[JOB.boat] || [])[0];
    const boat = jb ? await W.getRec(token, T.boats, jb).then(W.boatOut).catch(() => null) : null;
    return { id, state, photos, history, checkinId: (f[JOB.checkin] || [])[0] || null, boat };
  },
  // Everything needed to start a job for a HIN: last job (to prefill), the CRM
  // boat/customer, and this season's check-in (winterization requires a signed one).
  async prefill(token, tech, p) {
    const hin = normHin(p.hin);
    if (hin.length < 5) return { prev: null, crm: null, openJobId: null, checkin: null, coverage: null };
    const jobs = await W.list(token, T.jobs, { formula: `{HIN}="${esc(hin)}"`, fields: [JOB.state, JOB.status, JOB.dateIn], sort: [{ field: JOB.dateIn, direction: 'desc' }], max: 5 });
    const open = jobs.find((j) => sel(j.fields[JOB.status]) !== 'Complete');
    let prev = null;
    for (const j of jobs) { try { prev = JSON.parse(j.fields[JOB.state] || 'null'); } catch (e) {} if (prev) break; }
    const boat = await boatByHin(token, hin);
    const customer = boat && boat.custIds[0] ? await customerById(token, boat.custIds[0]) : null;
    const checkin = await checkinForBoat(token, boat && boat.id, hin);
    const coverage = boat && customer ? await coverageFor(token, customer.id, boat.id) : null;
    return { prev, crm: boat && customer ? { boat, customer } : null, openJobId: open ? open.id : null, checkin, coverage };
  },
  async createJob(token, tech, p) {
    const st = p.state || {};
    const hin = normHin(st.hin);
    if (hin.length >= 5) {
      const open = await W.list(token, T.jobs, { formula: `AND({HIN}="${esc(hin)}", {Status}!="Complete")`, fields: [JOB.status], max: 1 });
      if (open.length) return { id: open[0].id, existing: true };
    }
    const rec = await W.create(token, T.jobs, {
      ...jobSummaryFields(p.summary, tech), ...linkFields(st, JOB.boat, JOB.customer),
      [JOB.checkin]: recId(st.checkinId) ? [st.checkinId] : [], [JOB.state]: str(JSON.stringify(st)), [JOB.status]: 'In Progress',
    });
    await W.patch(token, T.jobs, rec.id, { [JOB.appId]: rec.id });
    return { id: rec.id };
  },
  async saveJob(token, tech, p) {
    const id = recId(p.id); if (!id) throw W.fail(400, 'Bad job id');
    const st = p.state || {};
    await W.patch(token, T.jobs, id, {
      ...jobSummaryFields(p.summary, tech), ...linkFields(st, JOB.boat, JOB.customer),
      [JOB.checkin]: recId(st.checkinId) ? [st.checkinId] : [], [JOB.state]: str(JSON.stringify(st)),
    });
    const boatId = st.boat && recId(st.boat.id);
    if (boatId) { const bf = boatFields(p.boat); if (Object.keys(bf).length) await W.patch(token, T.boats, boatId, bf); }
    return { savedAt: Date.now() };
  },

  // ---- photos (check-in or job) ----
  async uploadPhoto(token, tech, p) {
    const jobId = recId(p.jobId), checkinId = recId(p.checkinId);
    if (!jobId && !checkinId) throw W.fail(400, 'Bad job or check-in id');
    if (!p.data || p.data.length > MAX_B64) throw W.fail(413, 'Photo too large');
    const type = /^image\/(jpeg|png|webp)$/.test(p.contentType) ? p.contentType : 'image/jpeg';
    const at = Number(p.at) || Date.now();
    const uploadId = str(p.uploadId, 60).replace(/[^A-Za-z0-9_-]/g, '');
    const photoFrom = (id, f) => ({ id, item: f[PHOTO.stepId] || '', sec: f[PHOTO.section] || '', cap: f[PHOTO.caption] || 'Photo', by: f[PHOTO.by] || tech, at, thumb: W.attUrl((f[PHOTO.photo] || [])[0], 'large'), url: ((f[PHOTO.photo] || [])[0] || {}).url });
    // A retried upload (signal dropped after the first one saved) returns the photo already saved.
    let rec = null;
    if (uploadId) {
      const hit = await W.list(token, T.photos, { formula: `{Upload ID}="${uploadId}"`, fields: [PHOTO.photo, PHOTO.stepId, PHOTO.section, PHOTO.caption, PHOTO.by], max: 1 });
      if (hit.length && (hit[0].fields[PHOTO.photo] || []).length) return { photo: photoFrom(hit[0].id, hit[0].fields), existing: true };
      if (hit.length) rec = hit[0]; // saved but the image didn't attach: finish it below
    }
    // The photo belongs to the boat on its check-in or job (the parent also 404s if it was removed).
    const parent = checkinId ? await W.getRec(token, T.checkins, checkinId) : await W.getRec(token, T.jobs, jobId);
    const boatId = (parent.fields[checkinId ? CHK.boat : JOB.boat] || [])[0] || null;
    if (!rec) rec = await W.create(token, T.photos, {
      [PHOTO.caption]: str(p.caption, 250) || 'Photo', [PHOTO.job]: jobId ? [jobId] : [], [PHOTO.checkin]: checkinId ? [checkinId] : [],
      [PHOTO.stepId]: str(p.item, 60), [PHOTO.step]: str(p.step, 250), [PHOTO.section]: str(p.sec, 120), [PHOTO.by]: tech,
      [PHOTO.at]: new Date(at).toISOString(), [PHOTO.boat]: boatId ? [boatId] : [], [PHOTO.uploadId]: uploadId || undefined,
    });
    try {
      const att = await W.uploadAttachment(token, rec.id, PHOTO.photo, {
        data: p.data, contentType: type, filename: `${normHin(p.hin) || 'boat'}-${str(p.item, 40) || 'photo'}-${at}.${type.split('/')[1].replace('jpeg', 'jpg')}`,
      });
      return { photo: { id: rec.id, item: str(p.item, 60), sec: str(p.sec, 120), cap: str(p.caption, 250) || 'Photo', by: tech, at, thumb: att && att.url, url: att && att.url } };
    } catch (e) {
      await W.del(token, T.photos, rec.id).catch(() => {});
      throw e;
    }
  },
  async updatePhoto(token, tech, p) {
    const id = recId(p.id); if (!id) throw W.fail(400, 'Bad photo id');
    await W.patch(token, T.photos, id, { [PHOTO.caption]: str(p.caption, 250) });
    return {};
  },
  async deletePhoto(token, tech, p) {
    const id = recId(p.id), parent = recId(p.jobId || p.checkinId);
    if (!id || !parent) throw W.fail(400, 'Bad id');
    const r = await W.getRec(token, T.photos, id);
    const links = [...(r.fields[PHOTO.job] || []), ...(r.fields[PHOTO.checkin] || [])];
    if (!links.includes(parent)) throw W.fail(403, 'Photo is not on this record');
    await W.del(token, T.photos, id);
    return {};
  },
  // Image bytes for a PDF (Airtable's image links don't let the browser read them).
  async photoData(token, tech, p) {
    const id = recId(p.id); if (!id) throw W.fail(400, 'Bad photo id');
    const r = await W.getRec(token, T.photos, id);
    const url = W.attUrl((r.fields[PHOTO.photo] || [])[0], 'large');
    if (!url) throw W.fail(404, 'No image');
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString('base64'), type: res.headers.get('content-type') || 'image/jpeg' };
  },
  // Signatures and the customer service report PDF on a job. Replaces what was there.
  async uploadFile(token, tech, p) {
    const jobId = recId(p.jobId); if (!jobId) throw W.fail(400, 'Bad job id');
    const field = { techSig: JOB.techSig, revSig: JOB.revSig, report: JOB.reportPdf }[p.kind];
    if (!field) throw W.fail(400, 'Bad file kind');
    if (!p.data || p.data.length > MAX_B64) throw W.fail(413, 'File too large');
    const type = p.kind === 'report' ? 'application/pdf' : 'image/png';
    await W.patch(token, T.jobs, jobId, { [field]: [] });
    const att = await W.uploadAttachment(token, jobId, field, { data: p.data, contentType: type, filename: str(p.filename, 180) || (p.kind + (p.kind === 'report' ? '.pdf' : '.png')) });
    return { url: W.attUrl(att, 'large') || (att && att.url) };
  },
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return W.json(405, { ok: false, error: 'Method not allowed' });
  const token = process.env.AIRTABLE_TOKEN;
  if (!token || !process.env.WINTERIZE_PINS) {
    console.error('winterize: AIRTABLE_TOKEN or WINTERIZE_PINS is not set');
    return W.json(500, { ok: false, error: 'Server not configured' });
  }
  const tech = W.techForPin((event.headers || {})['x-tech-pin']);
  if (!tech) {
    await new Promise((r) => setTimeout(r, 600)); // slow down PIN guessing
    return W.json(401, { ok: false, error: 'PIN not recognized' });
  }
  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return W.json(400, { ok: false, error: 'Invalid JSON' }); }
  const fn = actions[p.action];
  if (!fn) return W.json(400, { ok: false, error: 'Unknown action' });
  try {
    return W.json(200, { ok: true, ...(await fn(token, tech, p)) });
  } catch (err) {
    console.error('winterize', p.action, err.status, err.message, err.data && JSON.stringify(err.data));
    const status = err.status && err.status < 500 && err.status !== 401 ? err.status : 502;
    return W.json(status, { ok: false, error: err.message || 'Airtable request failed' });
  }
};
