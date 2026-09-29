// Backend for the staff-only winterization checklist at /winterize.
//
// Every request must carry a tech PIN in the `x-tech-pin` header. PINs live in
// the WINTERIZE_PINS environment variable on the Netlify project, formatted as
//   Name:PIN,Name:PIN      e.g.  Brian:482913,Ben:771204
// Use 6+ digit PINs. Changing or removing a PIN there locks that device out on
// its next request (no redeploy needed beyond Netlify's env-var refresh).
//
// Writes go to the Waterline Marketing base:
//   Winterization Jobs   one row per boat per season (checklist state + summary)
//   Winterization Photos one row per photo, the image stored as an attachment
//   Boats                HIN / engine / hours / service dates written back
//
// Requires AIRTABLE_TOKEN (already set for the quote functions) with
// data.records:read and data.records:write on the base.

const crypto = require('crypto');
const { TABLES, CUSTOMER_FIELDS, BOAT_FIELDS, airtableRequest } = require('./_airtable');

const BASE_ID = 'appHvdREpgOcGf2k2';
const JOBS = 'tblBYFYOrtdz7Yd5o';
const PHOTOS = 'tbl4gpVQ7JJ9pgi8j';

const JOB_F = {
  title: 'fldbOKhHgP76OppgA', boat: 'fldy6IAbehJhCLvB5', customer: 'fldaClMCLegvwjpMB',
  status: 'fldYyZSh48cEu4pzU', svc: 'fldXqff4Og5277L6s', hin: 'fldnCvqDFj5YUcUKi',
  tech: 'fldWf6Iqeft8IlKZ8', reviewer: 'fldxb4qH1l0dCFDUM', dateIn: 'fldDpyXRuP0a786Gv',
  dateDone: 'fldgATvvSC5eJl29Q', hours: 'fldqVChE5mX39L6FE', volts: 'fldH0nGKv5OWXxBWQ',
  coolant: 'fldtMoLXFdLkVXx1b', af: 'fldSY2rQTkExmPEOW', fuel: 'fldWfqRezAmDdzWJJ',
  impeller: 'fldIpDckFcvpr1qr7', steps: 'fldhltVO1xLS9t5Tj', log: 'fldrZjSOmRn8LDD1s',
  parts: 'fld3dOIItXnniTtbB', recs: 'fldE6IY6k3rCVhHrM', quote: 'fldqe1JoLVq9raKeR',
  removed: 'fld4KOsv13cv1ds7x', spring: 'fldbh75LnHQ21dzOb', photoCount: 'fldHW2c7dq3uPpAKx',
  labor: 'fldmvOx3tg0UZaHLi', storage: 'fldBVB6GuzTfMrAlU', report: 'fldHgTTb02Rttsmpu',
  appId: 'fldPKCFL95xnmphNC', synced: 'fldWX6YGNAQlZsWz3', state: 'fld99YXrMOI1bffP6',
  techSig: 'fldf8EIrncWCzLJgE', revSig: 'fldoL0vJAGjoz44WP', reportPdf: 'fldZuXn3XU0X6juv5',
  customerName: 'fldBTJl9foiFFaxpb', photos: 'fldp2r5d1G0Fym19m',
};
const PHOTO_F = {
  caption: 'fldcjijmoVEUTzTz6', photo: 'fldS7Qn1bwfhmfhsT', job: 'fldhy4nRjTx68NEt0',
  step: 'fld8j4yx9CXZ1MZ7m', stepId: 'fldRWPmksboZ2tap0', section: 'fld4cgCMl15cjBudc',
  by: 'fldpdzOa9jrumUGfe', at: 'fldNPoe2NzbnJjlk9',
};
const BOAT_X = {
  mmc: 'fldAF9DehpYQWIvnv', hin: 'fldcjbkM38im7lKwT', year: 'fldNIe307QPlhVB1D',
  engine: 'fldvkIqN4yFHplU3P', serial: 'fldBdb8zvEfgKjUht', svc: 'fldVI9EEpyZyaALb8',
  cooling: 'fldQvstrpI7S45U9S', profile: 'fldmZgmaIsNXWB2wj', hours: 'fldvB5aNhOKKi1XD7',
  lastWint: 'fldMzSQ3j552j0w7b', impDate: 'fldB0nT11QmiQBlpl', storage: 'fldtyBf7SlbhjymMh',
};

const REC_RE = /^rec[A-Za-z0-9]{14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['In Progress', 'Awaiting Review', 'Complete'];
const SVC = ['Direct Drive', 'V-Drive', 'Inboard/Outboard', 'Pontoon', 'Outboard boat', 'PWC'];
const COOLING = ['Raw-water', 'Closed (freshwater)'];
const MAX_B64 = 5.4 * 1024 * 1024; // ~4 MB file; Airtable caps uploads at 5 MB

// ---------- helpers ----------
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  body: JSON.stringify(body),
});
const esc = (v) => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const str = (v, max = 100000) => (v == null ? '' : String(v)).slice(0, max);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const date = (v) => (DATE_RE.test(String(v || '')) ? v : null);
const recId = (v) => (REC_RE.test(String(v || '')) ? v : null);
const pick = (v, list) => (list.includes(v) ? v : undefined);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function techForPin(pin) {
  if (!pin || String(pin).length < 4) return null;
  const entries = String(process.env.WINTERIZE_PINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => { const i = s.lastIndexOf(':'); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; })
    .filter(([n, p]) => n && p && p.length >= 4);
  let match = null;
  for (const [name, p] of entries) {
    if (crypto.timingSafeEqual(sha(p), sha(pin))) match = name; // no early exit: constant work
  }
  return match;
}

function orIds(ids) {
  return 'OR(' + ids.map((id) => `RECORD_ID()="${id}"`).join(',') + ')';
}
async function list(token, table, { formula, fields, sort, max }) {
  const q = new URLSearchParams();
  q.set('returnFieldsByFieldId', 'true');
  if (formula) q.set('filterByFormula', formula);
  if (max) q.set('maxRecords', String(max));
  (fields || []).forEach((f) => q.append('fields[]', f));
  (sort || []).forEach((s, i) => { q.set(`sort[${i}][field]`, s.field); q.set(`sort[${i}][direction]`, s.direction || 'asc'); });
  const out = [];
  let offset;
  do {
    if (offset) q.set('offset', offset);
    const page = await airtableRequest(token, `/${table}?${q.toString()}`, { method: 'GET' });
    out.push(...(page.records || []));
    offset = page.offset;
  } while (offset && (!max || out.length < max));
  return out;
}
async function getRec(token, table, id) {
  return airtableRequest(token, `/${table}/${id}?returnFieldsByFieldId=true`, { method: 'GET' });
}
async function patch(token, table, id, fields) {
  return airtableRequest(token, `/${table}/${id}?returnFieldsByFieldId=true`, {
    method: 'PATCH', body: JSON.stringify({ fields, typecast: true }),
  });
}
async function uploadAttachment(token, recordId, fieldId, { data, contentType, filename }) {
  const res = await fetch(`https://content.airtable.com/v0/${BASE_ID}/${recordId}/${fieldId}/uploadAttachment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, file: data, filename }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body.error && (body.error.message || body.error.type)) || 'Attachment upload failed');
    err.status = res.status;
    throw err;
  }
  const atts = (body.fields && (body.fields[fieldId] || Object.values(body.fields)[0])) || [];
  return atts[atts.length - 1] || null;
}
const attUrl = (a, size) => (a ? ((a.thumbnails && a.thumbnails[size] && a.thumbnails[size].url) || a.url) : null);

function photoOut(r) {
  const f = r.fields || {};
  const att = (f[PHOTO_F.photo] || [])[0];
  return {
    id: r.id, item: f[PHOTO_F.stepId] || '', sec: f[PHOTO_F.section] || '', cap: f[PHOTO_F.caption] || '',
    by: f[PHOTO_F.by] || '', at: f[PHOTO_F.at] ? Date.parse(f[PHOTO_F.at]) : Date.parse(r.createdTime),
    thumb: attUrl(att, 'large'), url: att ? att.url : null,
  };
}
function customerOut(r) {
  const f = r.fields || {};
  return {
    id: r.id, name: f[CUSTOMER_FIELDS.name] || '(no name)', phone: f[CUSTOMER_FIELDS.phone] || '',
    email: f[CUSTOMER_FIELDS.email] || '', address: f[CUSTOMER_FIELDS.address] || '', boats: f[CUSTOMER_FIELDS.boatsLink] || [],
  };
}
function boatOut(r) {
  const f = r.fields || {};
  const sel = (v) => (v && typeof v === 'object' ? v.name : v) || '';
  return {
    id: r.id, name: f[BOAT_FIELDS.name] || 'Boat', type: sel(f[BOAT_FIELDS.type]), length: f[BOAT_FIELDS.length] || '',
    drive: sel(f[BOAT_FIELDS.style]), mmc: f[BOAT_X.mmc] || '', hin: f[BOAT_X.hin] || '', custIds: f[BOAT_FIELDS.customer] || [],
  };
}

// Summary fields sent by the page -> Winterization Jobs field IDs (whitelisted).
function summaryFields(s, tech) {
  s = s || {};
  const f = {
    [JOB_F.title]: str(s.title, 250) || 'Winterization',
    [JOB_F.status]: pick(s.status, STATUSES),
    [JOB_F.svc]: pick(s.svc, SVC),
    [JOB_F.hin]: str(s.hin, 40),
    [JOB_F.tech]: str(s.tech || tech, 120),
    [JOB_F.reviewer]: str(s.reviewer, 120),
    [JOB_F.dateIn]: date(s.dateIn),
    [JOB_F.dateDone]: date(s.dateDone),
    [JOB_F.hours]: num(s.hours), [JOB_F.volts]: num(s.volts), [JOB_F.coolant]: num(s.coolant),
    [JOB_F.af]: num(s.af), [JOB_F.fuel]: num(s.fuel), [JOB_F.labor]: num(s.labor),
    [JOB_F.impeller]: str(s.impeller, 120), [JOB_F.steps]: str(s.steps, 40),
    [JOB_F.log]: str(s.log), [JOB_F.parts]: str(s.parts), [JOB_F.recs]: str(s.recs),
    [JOB_F.quote]: !!s.quote, [JOB_F.removed]: str(s.removed), [JOB_F.spring]: str(s.spring),
    [JOB_F.photoCount]: num(s.photoCount), [JOB_F.storage]: str(s.storage, 250), [JOB_F.report]: !!s.report,
    [JOB_F.synced]: new Date().toISOString(),
  };
  Object.keys(f).forEach((k) => f[k] === undefined && delete f[k]);
  return f;
}
function boatFields(b) {
  b = b || {};
  const f = {};
  if (b.hin) f[BOAT_X.hin] = str(b.hin, 40);
  if (num(b.year)) f[BOAT_X.year] = num(b.year);
  if (b.engine) f[BOAT_X.engine] = str(b.engine, 250);
  if (b.serial) f[BOAT_X.serial] = str(b.serial, 120);
  if (pick(b.svc, SVC)) f[BOAT_X.svc] = b.svc;
  if (pick(b.cooling, COOLING)) f[BOAT_X.cooling] = b.cooling;
  if (b.profile) f[BOAT_X.profile] = str(b.profile, 120);
  if (num(b.hours) != null) f[BOAT_X.hours] = num(b.hours);
  if (b.storage) f[BOAT_X.storage] = str(b.storage, 250);
  if (b.mmc) f[BOAT_X.mmc] = str(b.mmc, 250);
  if (date(b.lastWint)) f[BOAT_X.lastWint] = b.lastWint;
  if (date(b.impDate)) f[BOAT_X.impDate] = b.impDate;
  return f;
}
function jobLinks(state) {
  const f = {};
  const b = state && state.boat && recId(state.boat.id);
  const c = state && state.customer && state.customer.src === 'crm' && recId(state.customer.id);
  f[JOB_F.boat] = b ? [b] : [];
  f[JOB_F.customer] = c ? [c] : [];
  return f;
}

// ---------- actions ----------
const actions = {
  async login(_, tech) { return { tech }; },

  async listJobs(token) {
    const recs = await list(token, JOBS, {
      fields: [JOB_F.title, JOB_F.hin, JOB_F.status, JOB_F.steps, JOB_F.dateIn, JOB_F.customerName, JOB_F.svc, JOB_F.storage, JOB_F.synced],
      sort: [{ field: JOB_F.synced, direction: 'desc' }], max: 150,
    });
    return {
      jobs: recs.map((r) => {
        const f = r.fields || {};
        const sel = (v) => (v && typeof v === 'object' ? v.name : v) || '';
        return {
          id: r.id, title: f[JOB_F.title] || '', hin: f[JOB_F.hin] || '', status: sel(f[JOB_F.status]) || 'In Progress',
          steps: f[JOB_F.steps] || '', dateIn: f[JOB_F.dateIn] || '', customer: (f[JOB_F.customerName] || [])[0] || '',
          svc: sel(f[JOB_F.svc]), storage: f[JOB_F.storage] || '',
        };
      }),
    };
  },

  async getJob(token, tech, p) {
    const id = recId(p.id); if (!id) throw Object.assign(new Error('Bad job id'), { status: 400 });
    const r = await getRec(token, JOBS, id);
    const f = r.fields || {};
    let state = null;
    try { state = JSON.parse(f[JOB_F.state] || 'null'); } catch (e) { state = null; }
    const photoIds = (f[JOB_F.photos] || []).filter((x) => REC_RE.test(x));
    const photos = [];
    for (let i = 0; i < photoIds.length; i += 40) {
      const chunk = photoIds.slice(i, i + 40);
      photos.push(...(await list(token, PHOTOS, { formula: orIds(chunk) })).map(photoOut));
    }
    let history = [];
    const hin = f[JOB_F.hin];
    if (hin) {
      const prev = await list(token, JOBS, {
        formula: `AND({HIN}="${esc(hin)}", RECORD_ID()!="${id}")`,
        fields: [JOB_F.title, JOB_F.status, JOB_F.dateIn, JOB_F.hours, JOB_F.impeller, JOB_F.recs],
        sort: [{ field: JOB_F.dateIn, direction: 'desc' }], max: 10,
      });
      history = prev.map((x) => ({
        id: x.id, status: (x.fields[JOB_F.status] && x.fields[JOB_F.status].name) || x.fields[JOB_F.status] || '',
        dateIn: x.fields[JOB_F.dateIn] || '', hours: x.fields[JOB_F.hours] || '', impeller: x.fields[JOB_F.impeller] || '',
        recs: x.fields[JOB_F.recs] || '',
      }));
    }
    return {
      id, state, photos, history,
      techSig: attUrl((f[JOB_F.techSig] || [])[0], 'large'), revSig: attUrl((f[JOB_F.revSig] || [])[0], 'large'),
      reportUrl: ((f[JOB_F.reportPdf] || [])[0] || {}).url || null,
    };
  },

  // Everything the page needs to start a job for a HIN: the most recent earlier
  // job for this hull (to prefill engine/profile/customer), or failing that the
  // Boat record in the CRM that already carries this HIN.
  async prefill(token, tech, p) {
    const hin = str(p.hin, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (hin.length < 5) return { prev: null, crm: null, openJobId: null };
    const jobs = await list(token, JOBS, {
      formula: `{HIN}="${esc(hin)}"`, fields: [JOB_F.state, JOB_F.status, JOB_F.dateIn],
      sort: [{ field: JOB_F.dateIn, direction: 'desc' }], max: 5,
    });
    const open = jobs.find((j) => ((j.fields[JOB_F.status] && j.fields[JOB_F.status].name) || j.fields[JOB_F.status]) !== 'Complete');
    let prev = null;
    for (const j of jobs) { try { prev = JSON.parse(j.fields[JOB_F.state] || 'null'); } catch (e) {} if (prev) break; }
    let crm = null;
    if (!prev || !prev.customer) {
      const boats = await list(token, TABLES.boats, {
        formula: `{HIN}="${esc(hin)}"`, fields: [BOAT_FIELDS.name, BOAT_FIELDS.customer, BOAT_FIELDS.type, BOAT_FIELDS.length, BOAT_FIELDS.style, BOAT_X.mmc, BOAT_X.hin], max: 2,
      });
      if (boats.length === 1) {
        const b = boatOut(boats[0]);
        if (b.custIds[0]) crm = { boat: b, customer: customerOut(await getRec(token, TABLES.customers, b.custIds[0])) };
      }
    }
    return { prev, crm, openJobId: open ? open.id : null };
  },

  async searchCustomers(token, tech, p) {
    const q = str(p.q, 80).trim().toLowerCase();
    if (!q) return { customers: [] };
    const recs = await list(token, TABLES.customers, {
      formula: `SEARCH("${esc(q)}", LOWER({Name}&" "&{Phone}&" "&{Email}))`,
      fields: [CUSTOMER_FIELDS.name, CUSTOMER_FIELDS.phone, CUSTOMER_FIELDS.email, CUSTOMER_FIELDS.address, CUSTOMER_FIELDS.boatsLink], max: 12,
    });
    return { customers: recs.map(customerOut) };
  },

  async customerBoats(token, tech, p) {
    const ids = (p.ids || []).filter((x) => REC_RE.test(x)).slice(0, 40);
    if (!ids.length) return { boats: [] };
    const recs = await list(token, TABLES.boats, {
      formula: orIds(ids),
      fields: [BOAT_FIELDS.name, BOAT_FIELDS.customer, BOAT_FIELDS.type, BOAT_FIELDS.length, BOAT_FIELDS.style, BOAT_X.mmc, BOAT_X.hin],
    });
    return { boats: recs.map(boatOut) };
  },

  async createJob(token, tech, p) {
    const state = p.state || {};
    const fields = { ...summaryFields(p.summary, tech), ...jobLinks(state), [JOB_F.state]: str(JSON.stringify(state)) };
    fields[JOB_F.status] = 'In Progress';
    const created = await airtableRequest(token, `/${JOBS}`, {
      method: 'POST', body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    const id = created.records[0].id;
    await patch(token, JOBS, id, { [JOB_F.appId]: id });
    return { id };
  },

  async saveJob(token, tech, p) {
    const id = recId(p.id); if (!id) throw Object.assign(new Error('Bad job id'), { status: 400 });
    const state = p.state || {};
    await patch(token, JOBS, id, { ...summaryFields(p.summary, tech), ...jobLinks(state), [JOB_F.state]: str(JSON.stringify(state)) });
    const boatId = state.boat && recId(state.boat.id);
    if (boatId) {
      const bf = boatFields(p.boat);
      if (Object.keys(bf).length) await patch(token, TABLES.boats, boatId, bf);
    }
    return { savedAt: Date.now() };
  },

  async uploadPhoto(token, tech, p) {
    const jobId = recId(p.jobId); if (!jobId) throw Object.assign(new Error('Bad job id'), { status: 400 });
    if (!p.data || p.data.length > MAX_B64) throw Object.assign(new Error('Photo too large'), { status: 413 });
    const type = /^image\/(jpeg|png|webp)$/.test(p.contentType) ? p.contentType : 'image/jpeg';
    const at = Number(p.at) || Date.now();
    const created = await airtableRequest(token, `/${PHOTOS}`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: {
        [PHOTO_F.caption]: str(p.caption, 250) || 'Photo', [PHOTO_F.job]: [jobId], [PHOTO_F.stepId]: str(p.item, 60),
        [PHOTO_F.step]: str(p.step, 250), [PHOTO_F.section]: str(p.sec, 120), [PHOTO_F.by]: tech,
        [PHOTO_F.at]: new Date(at).toISOString(),
      } }] }),
    });
    const rec = created.records[0];
    try {
      const att = await uploadAttachment(token, rec.id, PHOTO_F.photo, {
        data: p.data, contentType: type, filename: `${str(p.hin, 40) || 'boat'}-${str(p.item, 40) || 'photo'}-${at}.${type.split('/')[1].replace('jpeg', 'jpg')}`,
      });
      return { photo: { id: rec.id, item: str(p.item, 60), sec: str(p.sec, 120), cap: str(p.caption, 250) || 'Photo', by: tech, at, thumb: att && att.url, url: att && att.url } };
    } catch (e) {
      await airtableRequest(token, `/${PHOTOS}/${rec.id}`, { method: 'DELETE' }).catch(() => {});
      throw e;
    }
  },

  async updatePhoto(token, tech, p) {
    const id = recId(p.id); if (!id) throw Object.assign(new Error('Bad photo id'), { status: 400 });
    await patch(token, PHOTOS, id, { [PHOTO_F.caption]: str(p.caption, 250) });
    return {};
  },

  async deletePhoto(token, tech, p) {
    const id = recId(p.id), jobId = recId(p.jobId);
    if (!id || !jobId) throw Object.assign(new Error('Bad id'), { status: 400 });
    const r = await getRec(token, PHOTOS, id);
    if (!(r.fields[PHOTO_F.job] || []).includes(jobId)) throw Object.assign(new Error('Photo is not on this job'), { status: 403 });
    await airtableRequest(token, `/${PHOTOS}/${id}`, { method: 'DELETE' });
    return {};
  },

  // Returns a photo's image bytes so the page can place it in a PDF
  // (Airtable's image links don't allow the browser to read them directly).
  async photoData(token, tech, p) {
    const id = recId(p.id); if (!id) throw Object.assign(new Error('Bad photo id'), { status: 400 });
    const r = await getRec(token, PHOTOS, id);
    const att = (r.fields[PHOTO_F.photo] || [])[0];
    const url = attUrl(att, 'large');
    if (!url) throw Object.assign(new Error('No image'), { status: 404 });
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString('base64'), type: res.headers.get('content-type') || 'image/jpeg' };
  },

  // Signatures and the customer report PDF. Replaces whatever was there.
  async uploadFile(token, tech, p) {
    const jobId = recId(p.jobId); if (!jobId) throw Object.assign(new Error('Bad job id'), { status: 400 });
    const field = { techSig: JOB_F.techSig, revSig: JOB_F.revSig, report: JOB_F.reportPdf }[p.kind];
    if (!field) throw Object.assign(new Error('Bad file kind'), { status: 400 });
    if (!p.data || p.data.length > MAX_B64) throw Object.assign(new Error('File too large'), { status: 413 });
    const type = p.kind === 'report' ? 'application/pdf' : 'image/png';
    await patch(token, JOBS, jobId, { [field]: [] });
    const att = await uploadAttachment(token, jobId, field, { data: p.data, contentType: type, filename: str(p.filename, 180) || (p.kind + (p.kind === 'report' ? '.pdf' : '.png')) });
    return { url: attUrl(att, 'large') || (att && att.url) };
  },
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  const token = process.env.AIRTABLE_TOKEN;
  if (!token || !process.env.WINTERIZE_PINS) {
    console.error('winterize: AIRTABLE_TOKEN or WINTERIZE_PINS is not set');
    return json(500, { ok: false, error: 'Server not configured' });
  }
  const tech = techForPin(event.headers['x-tech-pin']);
  if (!tech) {
    await new Promise((r) => setTimeout(r, 600)); // slow down PIN guessing
    return json(401, { ok: false, error: 'PIN not recognized' });
  }
  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid JSON' }); }
  const fn = actions[p.action];
  if (!fn) return json(400, { ok: false, error: 'Unknown action' });
  try {
    return json(200, { ok: true, ...(await fn(token, tech, p)) });
  } catch (err) {
    console.error('winterize', p.action, err.status, err.message, err.data && JSON.stringify(err.data));
    const status = err.status && err.status < 500 && err.status !== 401 ? err.status : 502;
    return json(status, { ok: false, error: err.message || 'Airtable request failed' });
  }
};
