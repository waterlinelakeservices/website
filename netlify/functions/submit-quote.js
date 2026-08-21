// Receives quote-request submissions from the homepage form and writes them
// into the relational Customers -> Boats -> Quotes structure in the
// Waterline Marketing Airtable base (see _airtable.js for the shared
// find-or-create logic — this keeps a repeat visitor tied to one Customer
// record instead of creating a duplicate contact every time they submit).
//
// The form supports requesting quotes for more than one boat at once. The
// customer's contact info is submitted once and a separate Boat + Quote row
// is created for each boat in payload.boats, all linked to the same
// Customer record:
//   payload = {
//     name, phone, email, address, message, howHeard,
//     boats: [{ boatType, boatLength, packageInterest, addOns }, ...]
//   }
//
// For backwards compatibility (in case anything still posts the old
// single-boat shape), a payload with no boats array falls back to reading
// boatType/boatLength/packageInterest/addOns straight off the top level as
// one boat.
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const { QUOTE_FIELDS, findOrCreateCustomer, createBoat, createQuote } = require('./_airtable');

// Normalize form values to exactly match the Airtable select-field options.
const BOAT_TYPE_MAP = {
  'Ski / inboard': 'Ski / Inboard',
  Pontoon: 'Pontoon',
  'Jet Ski / PWC': 'Jet Ski / PWC',
  Other: 'Other',
};

// Normalize the public form's add-on checkbox values to the Airtable options.
const ADDON_MAP = {
  Detailing: 'Detailing',
  'Shrink wrapping': 'Shrink Wrapping',
  'Lift cover removal and install': 'Lift Cover Install',
  'Trailer bearing & tire check': 'Trailer Bearing & Tire Check',
  'Battery tender service': 'Battery Tender Service',
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid JSON' }) };
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    console.error('AIRTABLE_TOKEN is not set on this Netlify project');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Server not configured' }) };
  }

  const boatsPayload =
    Array.isArray(payload.boats) && payload.boats.length
      ? payload.boats
      : [
          {
            boatType: payload.boatType,
            boatLength: payload.boatLength,
            packageInterest: payload.packageInterest,
            addOns: payload.addOns,
          },
        ];

  try {
    const customerId = await findOrCreateCustomer(token, {
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      address: payload.address,
      howHeard: payload.howHeard,
    });

    const recordIds = [];
    for (const b of boatsPayload) {
      const boatType = BOAT_TYPE_MAP[b.boatType] || b.boatType || undefined;
      const addOns = Array.isArray(b.addOns) ? b.addOns.map((a) => ADDON_MAP[a] || a).filter(Boolean) : undefined;

      const boatId = await createBoat(token, customerId, {
        type: boatType,
        length: b.boatLength ? Number(b.boatLength) : undefined,
      });

      const quote = await createQuote(token, {
        [QUOTE_FIELDS.name]: payload.name || '',
        [QUOTE_FIELDS.phone]: payload.phone || '',
        [QUOTE_FIELDS.email]: payload.email || '',
        [QUOTE_FIELDS.address]: payload.address || undefined,
        [QUOTE_FIELDS.boatType]: boatType,
        [QUOTE_FIELDS.boatLength]: b.boatLength ? Number(b.boatLength) : undefined,
        [QUOTE_FIELDS.package]: b.packageInterest || undefined,
        [QUOTE_FIELDS.comments]: payload.message || '',
        [QUOTE_FIELDS.howHeard]: payload.howHeard || undefined,
        [QUOTE_FIELDS.submittedAt]: new Date().toISOString(),
        [QUOTE_FIELDS.status]: 'New',
        [QUOTE_FIELDS.quoteSource]: 'Website form',
        [QUOTE_FIELDS.customer]: [customerId],
        [QUOTE_FIELDS.boat]: [boatId],
        [QUOTE_FIELDS.addOns]: addOns && addOns.length ? addOns : undefined,
      });

      recordIds.push(quote.id);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, recordId: recordIds[0], recordIds }) };
  } catch (err) {
    console.error('submit-quote function error', err);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Could not save submission' }) };
  }
};
