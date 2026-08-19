// Receives finalized quotes from the staff-only internal quote tool
// (/internalquote) and writes them into the relational Customers -> Boats ->
// Quotes structure in the Waterline Marketing Airtable base:
//   - Finds the Customer by email/phone and updates their info, or creates a
//     new Customer if this is their first time in the system. This is what
//     keeps a customer with multiple boats/quotes tied to one Customer
//     record instead of spawning a duplicate contact every time.
//   - Creates a new Boat row linked to that Customer.
//   - Creates a new Quote row linked to both, tagged Status: "Quoted" and
//     Quote Source: "Internal quote tool".
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const { QUOTE_FIELDS, findOrCreateCustomer, createBoat, createQuote } = require('./_airtable');

// Normalize the internal tool's boat-category codes to the Airtable options.
const BOAT_TYPE_MAP = {
  SI: 'Ski / Inboard',
  Pontoon: 'Pontoon',
  PWC: 'Jet Ski / PWC',
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

  try {
    const boatType = BOAT_TYPE_MAP[payload.boatCategory];

    const customerId = await findOrCreateCustomer(token, {
      name: payload.customerName,
      phone: payload.phone,
      email: payload.email,
      address: payload.address,
    });

    const boatId = await createBoat(token, customerId, {
      name: payload.boatName,
      type: boatType,
      length: payload.boatLength ? Number(payload.boatLength) : undefined,
      style: payload.driveOrStyle,
    });

    const quote = await createQuote(token, {
      [QUOTE_FIELDS.name]: payload.customerName || '',
      [QUOTE_FIELDS.phone]: payload.phone || undefined,
      [QUOTE_FIELDS.email]: payload.email || undefined,
      [QUOTE_FIELDS.address]: payload.address || undefined,
      [QUOTE_FIELDS.boatType]: boatType,
      [QUOTE_FIELDS.boatLength]: payload.boatLength ? Number(payload.boatLength) : undefined,
      [QUOTE_FIELDS.package]: payload.package || undefined,
      [QUOTE_FIELDS.comments]: payload.quoteText || '',
      [QUOTE_FIELDS.pickupDate]: payload.pickupDate || undefined,
      [QUOTE_FIELDS.submittedAt]: new Date().toISOString(),
      [QUOTE_FIELDS.status]: 'Quoted',
      [QUOTE_FIELDS.quoteSource]: 'Internal quote tool',
      [QUOTE_FIELDS.quotedTotal]: payload.total ? Number(payload.total) : undefined,
      [QUOTE_FIELDS.customer]: [customerId],
      [QUOTE_FIELDS.boat]: [boatId],
      [QUOTE_FIELDS.addOns]: Array.isArray(payload.addOns) && payload.addOns.length ? payload.addOns : undefined,
      [QUOTE_FIELDS.discount]: payload.discount ? Number(payload.discount) : undefined,
      [QUOTE_FIELDS.override]: !!payload.overrideOn,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        recordId: quote.id,
        quoteLink: 'https://waterlinelakeservices.com/quote?id=' + quote.id,
      }),
    };
  } catch (err) {
    console.error('save-internal-quote function error', err);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Could not save quote' }) };
  }
};
