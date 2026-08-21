// Read-only lookup used by the internal quote tool
// (/internalquote?requestId=<quote record id>) to pull a CUSTOMER's full
// picture into the form automatically — every boat that customer has on
// file, not just the single boat tied to whichever Quote record was clicked.
// That way staff can see and adjust all of a customer's boats from one link.
//
// For each of the customer's boats, picks the "best" Quote to prefill from:
// the clicked quote itself (for the boat it belongs to), else that boat's
// Status = "New" quote if it has one, else its most recently submitted
// quote. Nothing here writes anything.
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const { TABLES, CUSTOMER_FIELDS, BOAT_FIELDS, QUOTE_FIELDS, airtableRequest } = require('./_airtable');

function getById(token, table, id) {
  return airtableRequest(token, `/${table}/${id}?returnFieldsByFieldId=true`, { method: 'GET' });
}

function statusName(rawStatus) {
  return (rawStatus && rawStatus.name) || rawStatus || '';
}

exports.handler = async function (event) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    console.error('AIRTABLE_TOKEN is not set on this Netlify project');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Server not configured' }) };
  }

  const id = (event.queryStringParameters || {}).id;
  if (!id || !/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid quote id' }) };
  }

  try {
    const clickedQuote = await getById(token, TABLES.quotes, id);
    const qf = clickedQuote.fields || {};
    const customerId = (qf[QUOTE_FIELDS.customer] && qf[QUOTE_FIELDS.customer][0]) || null;

    // No linked Customer at all (shouldn't normally happen) - fall back to
    // just this one quote's own fields plus its single linked boat.
    if (!customerId) {
      const boatId = (qf[QUOTE_FIELDS.boat] && qf[QUOTE_FIELDS.boat][0]) || null;
      const boat = boatId ? await getById(token, TABLES.boats, boatId).catch(() => null) : null;
      const bf = (boat && boat.fields) || {};

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          customerId: null,
          name: qf[QUOTE_FIELDS.name] || '',
          phone: qf[QUOTE_FIELDS.phone] || '',
          email: qf[QUOTE_FIELDS.email] || '',
          address: qf[QUOTE_FIELDS.address] || '',
          boats: [
            {
              boatId,
              quoteId: clickedQuote.id,
              boatName: bf[BOAT_FIELDS.name] || '',
              boatType: bf[BOAT_FIELDS.type] || '',
              boatLength: bf[BOAT_FIELDS.length] || '',
              style: bf[BOAT_FIELDS.style] || '',
              package: qf[QUOTE_FIELDS.package] || '',
              addOns: qf[QUOTE_FIELDS.addOns] || [],
              comments: qf[QUOTE_FIELDS.comments] || '',
              pickupDate: qf[QUOTE_FIELDS.pickupDate] || '',
              discount: qf[QUOTE_FIELDS.discount] || '',
              overrideOn: !!qf[QUOTE_FIELDS.override],
              quotedTotal: qf[QUOTE_FIELDS.quotedTotal] || '',
              status: statusName(qf[QUOTE_FIELDS.status]),
            },
          ],
        }),
      };
    }

    const customer = await getById(token, TABLES.customers, customerId);
    const cf = customer.fields || {};
    const boatIds = cf[CUSTOMER_FIELDS.boatsLink] || [];

    const boats = await Promise.all(
      boatIds.map(async (boatId) => {
        const boat = await getById(token, TABLES.boats, boatId).catch(() => null);
        if (!boat) return null;
        const bf = boat.fields || {};
        const quoteIds = bf[BOAT_FIELDS.quotesLink] || [];

        let quotes = await Promise.all(
          quoteIds.map((qid) => getById(token, TABLES.quotes, qid).catch(() => null))
        );
        quotes = quotes.filter(Boolean);

        // Prefer this boat's "New" quote, else its most recently submitted one.
        let bestQuote =
          quotes.find((q) => statusName(q.fields[QUOTE_FIELDS.status]) === 'New') ||
          quotes.slice().sort((a, b) => {
            const at = a.fields[QUOTE_FIELDS.submittedAt] || '';
            const bt = b.fields[QUOTE_FIELDS.submittedAt] || '';
            return bt.localeCompare(at);
          })[0];

        // Whichever boat the clicked link belongs to should always prefill
        // from the clicked quote itself, not some other quote on that boat.
        if (quoteIds.indexOf(clickedQuote.id) !== -1) {
          bestQuote = quotes.find((q) => q.id === clickedQuote.id) || bestQuote;
        }

        const qf2 = (bestQuote && bestQuote.fields) || {};

        return {
          boatId,
          quoteId: bestQuote ? bestQuote.id : null,
          boatName: bf[BOAT_FIELDS.name] || '',
          boatType: bf[BOAT_FIELDS.type] || '',
          boatLength: bf[BOAT_FIELDS.length] || '',
          style: bf[BOAT_FIELDS.style] || '',
          package: qf2[QUOTE_FIELDS.package] || '',
          addOns: qf2[QUOTE_FIELDS.addOns] || [],
          comments: qf2[QUOTE_FIELDS.comments] || '',
          pickupDate: qf2[QUOTE_FIELDS.pickupDate] || '',
          discount: qf2[QUOTE_FIELDS.discount] || '',
          overrideOn: !!qf2[QUOTE_FIELDS.override],
          quotedTotal: qf2[QUOTE_FIELDS.quotedTotal] || '',
          status: statusName(qf2[QUOTE_FIELDS.status]),
        };
      })
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        customerId,
        name: cf[CUSTOMER_FIELDS.name] || '',
        phone: cf[CUSTOMER_FIELDS.phone] || '',
        email: cf[CUSTOMER_FIELDS.email] || '',
        address: cf[CUSTOMER_FIELDS.address] || '',
        boats: boats.filter(Boolean),
      }),
    };
  } catch (err) {
    console.error('get-quote-request function error', err);
    return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'Quote request not found' }) };
  }
};
