// Called when a customer clicks "Accept this quote" on their live quote page
// (/quote?id=...). Flips the Quote's Status to "Quote Accepted" and stamps
// Accepted At. An Airtable Automation (set up in the base directly) watches
// for that Status change and emails service@waterlinelakeservices.com, so
// staff don't need to babysit this table for acceptances.
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const { TABLES, QUOTE_FIELDS, airtableRequest } = require('./_airtable');

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

  const id = payload.id;
  if (!id || !/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid quote id' }) };
  }

  try {
    await airtableRequest(token, `/${TABLES.quotes}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          [QUOTE_FIELDS.status]: 'Quote Accepted',
          [QUOTE_FIELDS.acceptedAt]: new Date().toISOString(),
        },
        typecast: true,
      }),
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('accept-quote function error', err);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Could not update quote' }) };
  }
};
