// Receives finalized quotes from the staff-only internal quote tool
// (/internalquote) and writes them into the relational Customers -> Boats ->
// Quotes structure in the Waterline Marketing Airtable base.
//
// The internal tool now works in one batch per Save click, covering every
// boat card currently in the session for one customer:
//   payload = {
//     customerId,      // set if this session started from a known customer
//                       // (loaded via ?requestId=... or otherwise already on
//                       // file) — null for a brand-new walk-in customer.
//     customerName, phone, email, address,
//     boats: [{ existingQuoteId, existingBoatId, boatName, boatCategory,
//               boatLength, driveOrStyle, package, pickupDate, addOns,
//               discount, overrideOn, total, quoteText }, ...]
//   }
//
// Customer: if customerId is already known, PATCH that exact record with
// whatever's in the Customer card — staff editing a known customer's info in
// the internal tool is meant to overwrite the CRM record. If customerId is
// NOT known, fall back to the original find-or-create-by-email/phone path
// for a genuinely new/walk-in customer.
//
// Each boat: if existingBoatId is already known, PATCH that exact Boat
// record (same "known record edits should overwrite" rule) instead of
// creating a duplicate row. If it's a boat the staff just added in this
// session, create a new Boat row linked to the customer.
//
// Each quote: if existingQuoteId is known, update that Quote in place
// (this is what ties the internal tool back to a website inquiry). If it's
// a new boat/new request, create a new Quote row linked to the customer and
// boat.
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const {
  CUSTOMER_FIELDS,
  BOAT_FIELDS,
  QUOTE_FIELDS,
  findOrCreateCustomer,
  updateCustomer,
  createBoat,
  updateBoat,
  createQuote,
  updateQuote,
} = require('./_airtable');

// Normalize the internal tool's boat-category codes to the Airtable options.
const BOAT_TYPE_MAP = {
  SI: 'Ski / Inboard',
  Pontoon: 'Pontoon',
  PWC: 'Jet Ski / PWC',
};

const REC_ID_RE = /^rec[A-Za-z0-9]{14}$/;

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

  const boatsPayload = Array.isArray(payload.boats) ? payload.boats : [];
  if (!boatsPayload.length) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'No boats in payload' }) };
  }

  try {
    // --- Customer: update-in-place if known, else find-or-create. ---
    let customerId = payload.customerId;
    const knownCustomer = customerId && REC_ID_RE.test(customerId);

    if (knownCustomer) {
      await updateCustomer(token, customerId, {
        [CUSTOMER_FIELDS.name]: payload.customerName || undefined,
        [CUSTOMER_FIELDS.phone]: payload.phone || undefined,
        [CUSTOMER_FIELDS.email]: payload.email || undefined,
        [CUSTOMER_FIELDS.address]: payload.address || undefined,
      });
    } else {
      customerId = await findOrCreateCustomer(token, {
        name: payload.customerName,
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
      });
    }

    // --- Each boat card: update-in-place if known, else create. ---
    const results = [];
    for (const boat of boatsPayload) {
      const boatType = BOAT_TYPE_MAP[boat.boatCategory];
      const knownBoat = boat.existingBoatId && REC_ID_RE.test(boat.existingBoatId);

      let boatId;
      if (knownBoat) {
        boatId = boat.existingBoatId;
        await updateBoat(token, boatId, {
          [BOAT_FIELDS.type]: boatType,
          [BOAT_FIELDS.length]: boat.boatLength ? Number(boat.boatLength) : undefined,
          [BOAT_FIELDS.style]: boat.driveOrStyle,
        });
      } else {
        boatId = await createBoat(token, customerId, {
          name: boat.boatName,
          type: boatType,
          length: boat.boatLength ? Number(boat.boatLength) : undefined,
          style: boat.driveOrStyle,
        });
      }

      const knownQuote = boat.existingQuoteId && REC_ID_RE.test(boat.existingQuoteId);
      let quoteId;

      if (knownQuote) {
        quoteId = boat.existingQuoteId;
        await updateQuote(token, quoteId, {
          [QUOTE_FIELDS.package]: boat.package || undefined,
          [QUOTE_FIELDS.comments]: boat.quoteText || '',
          [QUOTE_FIELDS.pickupDate]: boat.pickupDate || undefined,
          [QUOTE_FIELDS.status]: 'Quoted',
          [QUOTE_FIELDS.quoteSource]: 'Internal quote tool',
          [QUOTE_FIELDS.quotedTotal]: boat.total ? Number(boat.total) : undefined,
          [QUOTE_FIELDS.addOns]: Array.isArray(boat.addOns) && boat.addOns.length ? boat.addOns : undefined,
          [QUOTE_FIELDS.discount]: boat.discount ? Number(boat.discount) : undefined,
          [QUOTE_FIELDS.override]: !!boat.overrideOn,
        });
      } else {
        const quote = await createQuote(token, {
          [QUOTE_FIELDS.name]: payload.customerName || '',
          [QUOTE_FIELDS.phone]: payload.phone || undefined,
          [QUOTE_FIELDS.email]: payload.email || undefined,
          [QUOTE_FIELDS.address]: payload.address || undefined,
          [QUOTE_FIELDS.boatType]: boatType,
          [QUOTE_FIELDS.boatLength]: boat.boatLength ? Number(boat.boatLength) : undefined,
          [QUOTE_FIELDS.package]: boat.package || undefined,
          [QUOTE_FIELDS.comments]: boat.quoteText || '',
          [QUOTE_FIELDS.pickupDate]: boat.pickupDate || undefined,
          [QUOTE_FIELDS.submittedAt]: new Date().toISOString(),
          [QUOTE_FIELDS.status]: 'Quoted',
          [QUOTE_FIELDS.quoteSource]: 'Internal quote tool',
          [QUOTE_FIELDS.quotedTotal]: boat.total ? Number(boat.total) : undefined,
          [QUOTE_FIELDS.customer]: [customerId],
          [QUOTE_FIELDS.boat]: [boatId],
          [QUOTE_FIELDS.addOns]: Array.isArray(boat.addOns) && boat.addOns.length ? boat.addOns : undefined,
          [QUOTE_FIELDS.discount]: boat.discount ? Number(boat.discount) : undefined,
          [QUOTE_FIELDS.override]: !!boat.overrideOn,
        });
        quoteId = quote.id;
      }

      results.push({
        boatId,
        quoteId,
        quoteLink: 'https://waterlinelakeservices.com/quote?id=' + quoteId,
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        customerId,
        boats: results,
      }),
    };
  } catch (err) {
    console.error('save-internal-quote function error', err);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Could not save quote' }) };
  }
};
