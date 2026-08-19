// Shared Airtable helpers for the Waterline Marketing base.
// Used by submit-quote.js, save-internal-quote.js, accept-quote.js, and
// get-quote-request.js so the Customers -> Boats -> Quotes relational
// structure is built the same way everywhere a record gets written.
//
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const AIRTABLE_BASE_ID = 'appHvdREpgOcGf2k2';

const TABLES = {
  customers: 'tblAacOFSf3NSw9aY',
  boats: 'tblHJtYtYtcNCEabu',
  quotes: 'tblm3InsiBnTS1bqg',
};

// Field IDs, keyed by table. Using IDs (not names) so a future field rename
// in the Airtable UI doesn't silently break these functions.
const CUSTOMER_FIELDS = {
  name: 'fldccNfTV7yngmo06',
  phone: 'fldGNp1Ih0RnXCr2R',
  email: 'fldDTtalpZJuau9dN',
  address: 'fldjKCMHICPwupgft',
  howHeard: 'fldXap1uAxQZpiW32',
  zohoId: 'fld399YPJaCMJgxgx',
};

const BOAT_FIELDS = {
  name: 'fldbDa8WOuSa1VTjV',
  customer: 'fldlqKc6mmAfB5SuP',
  type: 'fldqNu6yhurVfBsLO',
  length: 'fldI7KFd1RLfo32CD',
  style: 'fldLXDHIo7R5ElIjB',
};

const QUOTE_FIELDS = {
  name: 'fld8v9zdSeO93a81d',
  submittedAt: 'fld7BNRJ0pXjLrVhn',
  phone: 'fldfSZkyJtdgHRDO6',
  email: 'fld6cRIEr4TrXl5kA',
  boatType: 'fldt861BpC41uQlzj',
  boatLength: 'fld6vyLQ02BR7vRMH',
  package: 'fldeBSzWondYxrmWG',
  comments: 'fldJkm9a942bDJhfc',
  howHeard: 'fldgmem29M8L0IJ8j',
  status: 'fld5YYU6Sh9PvnxIK',
  address: 'fldKSV2EQMXZHls5l',
  quotedTotal: 'fldyg8ZvR53DoCg3w',
  quoteSource: 'fldo09AC2RdbHIxWs',
  zohoId: 'fldSMFjxHkFOxswbL',
  pickupDate: 'fldOI1Y7GHI5fG6LO',
  customer: 'fld1mf7XzL2ujVeSE',
  boat: 'fldgPck8s39xsFFtx',
  addOns: 'fldzu5sL32KFuGVag',
  discount: 'fldXwZA2Uhukr2r9n',
  override: 'fldtEaW04aa6o8bJQ',
  acceptedAt: 'fldY21hYBOMCgcXCK',
  quoteLink: 'fldARQgWcooto0A4c',
};

function escapeFormulaValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function stripUndefined(fields) {
  const out = {};
  Object.keys(fields).forEach((key) => {
    if (fields[key] !== undefined) out[key] = fields[key];
  });
  return out;
}

async function airtableRequest(token, path, options) {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options && options.headers),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || 'Airtable request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Finds an existing Customer by email (case-insensitive), or by phone if no
// email is given. If a match exists, updates it with any newly-provided
// fields (so re-quoting an existing customer refreshes their info instead of
// creating a duplicate contact). Otherwise creates a brand-new Customer.
// Returns the Customer record ID.
async function findOrCreateCustomer(token, { name, phone, email, address, howHeard, zohoId }) {
  let existing = null;

  if (email) {
    const formula = `LOWER({Email}) = "${escapeFormulaValue(email.toLowerCase())}"`;
    const found = await airtableRequest(
      token,
      `/${TABLES.customers}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`,
      { method: 'GET' }
    );
    if (found.records && found.records.length) existing = found.records[0];
  }
  if (!existing && phone) {
    const formula = `{Phone} = "${escapeFormulaValue(phone)}"`;
    const found = await airtableRequest(
      token,
      `/${TABLES.customers}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`,
      { method: 'GET' }
    );
    if (found.records && found.records.length) existing = found.records[0];
  }

  const fields = stripUndefined({
    [CUSTOMER_FIELDS.name]: name || undefined,
    [CUSTOMER_FIELDS.phone]: phone || undefined,
    [CUSTOMER_FIELDS.email]: email || undefined,
    [CUSTOMER_FIELDS.address]: address || undefined,
    [CUSTOMER_FIELDS.howHeard]: howHeard || undefined,
    [CUSTOMER_FIELDS.zohoId]: zohoId || undefined,
  });

  if (existing) {
    await airtableRequest(token, `/${TABLES.customers}/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields, typecast: true }),
    });
    return existing.id;
  }

  const created = await airtableRequest(token, `/${TABLES.customers}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return created.records[0].id;
}

// Always creates a new Boat row linked to the given Customer. Boats aren't
// deduped against existing rows for this customer — matching "is this the
// same physical boat as last season" reliably from a webhook isn't worth the
// fragility. Ben can merge duplicate Boat rows by hand in Airtable if a
// repeat customer ends up with more than one row for the same boat; what
// matters for the CRM goal is that every boat stays linked to the right
// Customer record, which this guarantees.
async function createBoat(token, customerId, { name, type, length, style }) {
  const fields = stripUndefined({
    [BOAT_FIELDS.name]: name || type || undefined,
    [BOAT_FIELDS.customer]: [customerId],
    [BOAT_FIELDS.type]: type || undefined,
    [BOAT_FIELDS.length]: length || undefined,
    [BOAT_FIELDS.style]: style || undefined,
  });
  const created = await airtableRequest(token, `/${TABLES.boats}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return created.records[0].id;
}

async function createQuote(token, fieldsById) {
  const fields = stripUndefined(fieldsById);
  const created = await airtableRequest(token, `/${TABLES.quotes}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return created.records[0];
}

// Updates an existing Quote record in place (used when the internal quote
// tool is finishing out a request that already came in through the website
// form — see get-quote-request.js / save-internal-quote.js). Only touches
// the Quote's own fields; never touches the linked Customer or Boat records,
// so there's no risk of a staff typo overwriting a customer's saved info.
async function updateQuote(token, quoteId, fieldsById) {
  const fields = stripUndefined(fieldsById);
  const updated = await airtableRequest(token, `/${TABLES.quotes}/${quoteId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: true }),
  });
  return updated;
}

module.exports = {
  TABLES,
  CUSTOMER_FIELDS,
  BOAT_FIELDS,
  QUOTE_FIELDS,
  airtableRequest,
  findOrCreateCustomer,
  createBoat,
  createQuote,
  updateQuote,
};
