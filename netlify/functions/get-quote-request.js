// Read-only lookup used by the internal quote tool
// (/internalquote?requestId=<quote record id>) to pull a customer's original
// website inquiry into the form automatically, so staff don't have to retype
// it — and so there's no risk of a typo on the name/phone/email breaking the
// "same customer" match that findOrCreateCustomer relies on elsewhere.
//
// Returns the Quote's own fields plus whatever the linked Customer and Boat
// records have on file. Nothing here writes anything.
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const { TABLES, airtableRequest } = require('./_airtable');

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
    const quote = await airtableRequest(token, `/${TABLES.quotes}/${id}`, { method: 'GET' });
    const f = quote.fields || {};

    const customerLink = f['Customer'] && f['Customer'][0];
    const boatLink = f['Boat'] && f['Boat'][0];

    const [customer, boat] = await Promise.all([
      customerLink ? airtableRequest(token, `/${TABLES.customers}/${customerLink}`, { method: 'GET' }).catch(() => null) : null,
      boatLink ? airtableRequest(token, `/${TABLES.boats}/${boatLink}`, { method: 'GET' }).catch(() => null) : null,
    ]);

    const cf = (customer && customer.fields) || {};
    const bf = (boat && boat.fields) || {};
    const status = (f['Status'] && f['Status'].name) || f['Status'] || '';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        quoteId: quote.id,
        customerId: customerLink || null,
        boatId: boatLink || null,
        status,
        name: cf['Name'] || f['Name'] || '',
        phone: cf['Phone'] || f['Phone'] || '',
        email: cf['Email'] || f['Email'] || '',
        address: cf['Address'] || f['Address'] || '',
        boatType: bf['Boat Type'] || f['Boat Type'] || '',
        boatLength: bf['Length (ft)'] || f['Boat Length (ft)'] || '',
        package: f['Package'] || '',
        addOns: f['Add-ons'] || [],
        comments: f['Comments'] || '',
        pickupDate: f['Desired Pickup Date'] || '',
      }),
    };
  } catch (err) {
    console.error('get-quote-request function error', err);
    return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'Quote request not found' }) };
  }
};
