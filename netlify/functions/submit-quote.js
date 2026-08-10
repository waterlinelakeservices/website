// Receives quote-request submissions from the homepage form and logs them
// into the "Quote Requests" table of the Waterline Marketing Airtable base.
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const AIRTABLE_BASE_ID = 'appHvdREpgOcGf2k2';
const AIRTABLE_TABLE_ID = 'tblm3InsiBnTS1bqg';

// Normalize form values to exactly match the Airtable select-field options.
const BOAT_TYPE_MAP = {
  'Ski / inboard': 'Ski / Inboard',
  Pontoon: 'Pontoon',
  Other: 'Other',
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

  const fields = {
    Name: payload.name || '',
    Phone: payload.phone || '',
    Email: payload.email || '',
    'Boat Type': BOAT_TYPE_MAP[payload.boatType] || payload.boatType || undefined,
    'Boat Length (ft)': payload.boatLength ? Number(payload.boatLength) : undefined,
    Package: payload.packageInterest || undefined,
    Comments: payload.message || '',
    'How Heard About Us': payload.howHeard || undefined,
    'Submitted At': new Date().toISOString(),
    Status: 'New',
  };

  // Airtable rejects explicit `undefined` values — strip them.
  Object.keys(fields).forEach((key) => {
    if (fields[key] === undefined) delete fields[key];
  });

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Airtable error', data);
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: 'Could not save submission' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('submit-quote function error', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Unexpected error' }) };
  }
};
