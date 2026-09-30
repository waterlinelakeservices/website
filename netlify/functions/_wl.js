// Shared helpers for the staff tools (/winterize) and the customer
// agreement page (/agreement). Everything talks to the Waterline Marketing base
// using field IDs, so renaming a field in Airtable's UI never breaks anything.

const crypto = require('crypto');
const { airtableRequest } = require('./_airtable');

const BASE_ID = 'appHvdREpgOcGf2k2';

const T = {
  customers: 'tblAacOFSf3NSw9aY',
  boats: 'tblHJtYtYtcNCEabu',
  jobs: 'tblBYFYOrtdz7Yd5o',
  photos: 'tbl4gpVQ7JJ9pgi8j',
  checkins: 'tbllaqyuT5tSkpWb2',
  agreements: 'tblIVdd4AILcTlXzw',
};

const CUST = {
  name: 'fldccNfTV7yngmo06', phone: 'fldGNp1Ih0RnXCr2R', email: 'fldDTtalpZJuau9dN',
  address: 'fldjKCMHICPwupgft', boats: 'fld9cDE3Sy54fv2g3', checkins: 'fld3uFE6w3BSqlzR4',
  agreements: 'fldTNMPKVZOmZOv85',
};
const BOAT = {
  name: 'fldbDa8WOuSa1VTjV', customer: 'fldlqKc6mmAfB5SuP', type: 'fldqNu6yhurVfBsLO',
  length: 'fldI7KFd1RLfo32CD', style: 'fldLXDHIo7R5ElIjB', mmc: 'fldAF9DehpYQWIvnv',
  hin: 'fldcjbkM38im7lKwT', year: 'fldNIe307QPlhVB1D', engine: 'fldvkIqN4yFHplU3P',
  svc: 'fldVI9EEpyZyaALb8', cooling: 'fldQvstrpI7S45U9S', profile: 'fldmZgmaIsNXWB2wj',
  hours: 'fldvB5aNhOKKi1XD7', lastWint: 'fldMzSQ3j552j0w7b', impDate: 'fldB0nT11QmiQBlpl',
  checkins: 'fldtkaf2mkplF4908', agreements: 'fld6Oui8hnVlz4bDx',
};
const CHK = {
  title: 'fldUAYRbqlHsRgwsV', boat: 'fldtopXF2ao919TmK', customer: 'fldQBwFPaxRc28c14',
  agreement: 'fldqOLNITvwnxlu75', status: 'fldPS9E9tVwm5RyLW', hin: 'fldzrxyuV1fCPNcai',
  season: 'fldo0Mycxf9tN90Xk', at: 'fldG6FS0tBP3DJG8u', by: 'fldlduIcTOi7113q5',
  where: 'fldYzg6Na4L2GjqWx', hours: 'fldJdZaXbkSBWziUZ', fuel: 'fld25zJ82GpcqOmgF',
  damage: 'fld24XHgPBlZLU5ys', items: 'fldqUBEkVHcvzLafL', keys: 'fldcFCUHykBijSKnf',
  notes: 'fldUqgLRGR8a5Ebq8', photoCount: 'fldXt41zUXszi9vB7', overrideReason: 'fldjgLyCuLVxXqcdE',
  overrideBy: 'fldwUXbSxelupitLV', synced: 'fld92NDhlOiMsgwCK', state: 'fldLSTQqjFIZjLhGs',
  photos: 'fldBQKoxqnYd0X3LT', jobs: 'fldJ2gA5FhShXUJuc', stage: 'fldx3iFg1PgyppmEd',
};
const AGR = {
  ref: 'fldfv4QgeLGdDJJIW', customer: 'fldQR4G3GSBl1hPpm', boats: 'fldgyDe790nfU1vVk',
  status: 'fldkY7yonYRLEPfcp', season: 'fldMgXnO7sRbOLLho', signedAt: 'fld42WLrjK4yXTiZg',
  name: 'fldyPeCpbsrJtinAD', email: 'fldX97YTThY67nElm', phone: 'fldEFoqToBWhqAscC',
  address: 'fldsINhlealUbYadO', quoteRef: 'fldbogxQAeuNks3RA', vessels: 'fldE8zoO3zfVn7WFi',
  via: 'fldcApePpEPUGm2KQ', witness: 'fldSjeICSbFmp72c0', sigType: 'fldmw7Jd2v8rbRUnU',
  signature: 'fld1faNN7tdvPKGTf', pdf: 'fldV8rJ5eWdnMa1Yx', driveLink: 'fldMKieN2go8gB7v3',
  driveStatus: 'fldDVa68Q0Zl4lvPP', version: 'fldbLvs6sJ3SKoJd7', sha: 'fldZ5OYjeCzULWU1K',
  consent: 'fldFEhlROqxXaoo4l', conditionAck: 'fldh8DbnvOCsXJ808', ip: 'fldi93IDjYs3hiBJS',
  device: 'fldlWjpXgfbbbXQ7R', checkins: 'fldqjHGjU2tcBM2a8',
};
const PHOTO = {
  caption: 'fldcjijmoVEUTzTz6', photo: 'fldS7Qn1bwfhmfhsT', job: 'fldhy4nRjTx68NEt0',
  step: 'fld8j4yx9CXZ1MZ7m', stepId: 'fldRWPmksboZ2tap0', section: 'fld4cgCMl15cjBudc',
  by: 'fldpdzOa9jrumUGfe', at: 'fldNPoe2NzbnJjlk9', checkin: 'fldt6CQEn6LpoV6gZ',
};

const REC_RE = /^rec[A-Za-z0-9]{14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  body: JSON.stringify(body),
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const esc = (v) => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const str = (v, max = 100000) => (v == null ? '' : String(v)).slice(0, max);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const date = (v) => (DATE_RE.test(String(v || '')) ? v : null);
const recId = (v) => (REC_RE.test(String(v || '')) ? v : null);
const pick = (v, list) => (list.includes(v) ? v : undefined);
const sel = (v) => (v && typeof v === 'object' ? v.name : v) || '';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

// Season runs July 1 through June 30, e.g. Oct 2026 and Apr 2027 are both "2026-2027".
function seasonFor(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Indiana/Indianapolis', year: 'numeric', month: 'numeric' }).formatToParts(d);
  const y = +parts.find((p) => p.type === 'year').value;
  const m = +parts.find((p) => p.type === 'month').value;
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// Tech PINs: WINTERIZE_PINS = "Name:PIN,Name:PIN" on the Netlify project.
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

const orIds = (ids) => 'OR(' + ids.map((id) => `RECORD_ID()="${id}"`).join(',') + ')';

async function list(token, table, { formula, fields, sort, max } = {}) {
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
// Fetch many records by ID (chunked so the formula stays short).
async function byIds(token, table, ids, fields) {
  const clean = [...new Set((ids || []).filter((x) => REC_RE.test(x)))];
  const out = [];
  for (let i = 0; i < clean.length; i += 40) out.push(...(await list(token, table, { formula: orIds(clean.slice(i, i + 40)), fields })));
  return out;
}
const getRec = (token, table, id) => airtableRequest(token, `/${table}/${id}?returnFieldsByFieldId=true`, { method: 'GET' });
const patch = (token, table, id, fields) => airtableRequest(token, `/${table}/${id}?returnFieldsByFieldId=true`, {
  method: 'PATCH', body: JSON.stringify({ fields, typecast: true }),
});
async function create(token, table, fields) {
  const r = await airtableRequest(token, `/${table}?returnFieldsByFieldId=true`, {
    method: 'POST', body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return r.records[0];
}
const del = (token, table, id) => airtableRequest(token, `/${table}/${id}`, { method: 'DELETE' });
// Delete many records, 10 per request (Airtable's limit).
async function delMany(token, table, ids) {
  const list = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < list.length; i += 10) {
    const qs = list.slice(i, i + 10).map((id) => 'records[]=' + encodeURIComponent(id)).join('&');
    await airtableRequest(token, `/${table}?${qs}`, { method: 'DELETE' });
  }
  return list.length;
}

async function uploadAttachment(token, recordId, fieldId, { data, contentType, filename }) {
  const res = await fetch(`https://content.airtable.com/v0/${BASE_ID}/${recordId}/${fieldId}/uploadAttachment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, file: data, filename }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(res.status, (body.error && (body.error.message || body.error.type)) || 'Attachment upload failed');
  const atts = (body.fields && (body.fields[fieldId] || Object.values(body.fields)[0])) || [];
  return atts[atts.length - 1] || null;
}
const attUrl = (a, size) => (a ? ((a.thumbnails && a.thumbnails[size] && a.thumbnails[size].url) || a.url) : null);

function customerOut(r) {
  const f = r.fields || {};
  return {
    id: r.id, name: f[CUST.name] || '(no name)', phone: f[CUST.phone] || '', email: f[CUST.email] || '',
    address: f[CUST.address] || '', boats: f[CUST.boats] || [],
  };
}
function boatOut(r) {
  const f = r.fields || {};
  return {
    id: r.id, name: f[BOAT.name] || 'Boat', type: sel(f[BOAT.type]), length: f[BOAT.length] || '',
    drive: sel(f[BOAT.style]), mmc: f[BOAT.mmc] || '', hin: f[BOAT.hin] || '', year: f[BOAT.year] || '',
    custIds: f[BOAT.customer] || [],
  };
}
const BOAT_READ = [BOAT.name, BOAT.customer, BOAT.type, BOAT.length, BOAT.style, BOAT.mmc, BOAT.hin, BOAT.year];
const CUST_READ = [CUST.name, CUST.phone, CUST.email, CUST.address, CUST.boats];

const clientIp = (event) => {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || h['client-ip'] || '').trim();
};

module.exports = {
  BASE_ID, T, CUST, BOAT, CHK, AGR, PHOTO, REC_RE,
  json, fail, esc, str, num, date, recId, pick, sel, seasonFor, techForPin,
  list, byIds, getRec, patch, create, del, delMany, uploadAttachment, attUrl,
  customerOut, boatOut, BOAT_READ, CUST_READ, clientIp,
};
