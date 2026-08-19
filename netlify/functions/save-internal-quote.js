// Receives finalized quotes from the staff-only internal quote tool
// (/internalquote) and writes them into the relational Customers -> Boats ->
// Quotes structure in the Waterline Marketing Airtable base.
//
// Two paths, depending on whether this quote started life as a website
// inquiry (payload.existingQuoteId set by get-quote-request.js / the
// "requestId" link on a Quote record):
//   - Linked to an existing request: update that SAME Quote record in place
//     (Status -> Quoted, pricing, add-ons, etc.) and leave the Customer and
//     Boat records it's already linked to completely untouched. This is what
//     ties the internal tool back to the original request without any risk
//     of a staff typo overwriting that customer's or boat's saved info.
//   - No linked request (a walk-in / phone quote): find-or-create the
//     Customer by email/phone (so a repeat customer stays tied to one
//     Customer record instead of getting duplicated), create a new Boat row,
//     and create a new Quote row linked to both — the original behavior.
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const { QUOTE_FIELDS, findOrCreateCustomer, createBoat, createQuote, updateQuote } = require('./_airtable');

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
    const existingQuoteId = payload.existingQuoteId;
    const isLinkedToRequest = existingQuoteId && /^rec[A-Za-z0-9]{14}$/.test(existingQuoteId);

    if (isLinkedToRequest) {
      // Update the original website-inquiry Quote record in place. No
      // Customer or Boat fields are touched here on purpose.
      await updateQuote(token, existingQuoteId, {
        [QUOTE_FIELDS.package]: payload.package || undefined,
        [QUOTE_FIELDS.comments]: payload.quoteText || '',
        [QUOTE_FIELDS.pickupDate]: payload.pickupDate || undefined,
        [QUOTE_FIELDS.status]: 'Quoted',
        [QUOTE_FIELDS.quoteSource]: 'Internal quote tool',
        [QUOTE_FIELDS.quotedTotal]: payload.total ? Number(payload.total) : undefined,
        [QUOTE_FIELDS.addOns]: Array.isArray(payload.addOns) && payload.addOns.length ? payload.addOns : undefined,
        [QUOTE_FIELDS.discount]: payload.discount ? Number(payload.discount) : undefined,
        [QUOTE_FIELDS.override]: !!payload.overrideOn,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          recordId: existingQuoteId,
          quoteLink: 'https://waterlinelakeservices.com/quote?id=' + existingQuoteId,
        }),
      };
    }

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
