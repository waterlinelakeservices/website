// Serves a live, customer-facing quote page at /quote?id=<record id>.
// Staff get this link automatically after saving a quote in the internal
// quote tool (it's also embedded in the PDF) and can text or email it to the
// customer. The customer sees a clean summary of their quote and can accept
// it online — accepting POSTs to /api/accept-quote, which flips the Quote's
// Status in Airtable and (via an Airtable Automation) emails staff.
// Requires the AIRTABLE_TOKEN environment variable (set on the Netlify project).

const { TABLES, airtableRequest } = require('./_airtable');

const DEEP = '#134E5E';
const DEEP_DARK = '#0C3944';
const GLACIER = '#8CC7D6';
const STONE = '#E8ECEF';
const INK = '#16232B';
const MUTED = '#6A7480';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function money(n) {
  const num = Number(n || 0);
  return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function page(bodyHtml, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title || 'Your Waterline Quote')}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: ${STONE}; color: ${INK}; font-family: 'Work Sans', sans-serif; -webkit-font-smoothing: antialiased; }
  .voice { font-family: 'Fraunces', serif; }
  header { background: linear-gradient(160deg, ${DEEP} 0%, ${DEEP_DARK} 100%); color: #fff; padding: 30px 24px; text-align: center; }
  header .name { font-family: 'Fraunces', serif; font-size: 24px; margin: 0 0 4px; }
  header .tag { font-size: 12.5px; color: ${GLACIER}; letter-spacing: 0.04em; }
  .wrap { max-width: 560px; margin: -20px auto 40px; padding: 0 20px; }
  .card { background: #fff; border-radius: 16px; padding: 28px 26px; border: 1px solid #DCE3E6; box-shadow: 0 8px 24px rgba(12,57,68,0.08); }
  .card + .card { margin-top: 16px; }
  h2 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 18px; color: ${DEEP}; margin: 0 0 14px; }
  .row { display: flex; justify-content: space-between; padding: 7px 0; border-top: 1px solid #EEF1F2; font-size: 14px; }
  .row:first-child { border-top: none; }
  .row b { font-weight: 500; }
  .muted { color: ${MUTED}; font-size: 12.5px; }
  .total-box { background: ${DEEP}; color: #fff; border-radius: 12px; padding: 18px 20px; display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; }
  .total-box .label { font-size: 12.5px; letter-spacing: 0.05em; text-transform: uppercase; color: ${GLACIER}; }
  .total-box .amt { font-family: 'Fraunces', serif; font-size: 28px; }
  ul.addons { margin: 0; padding-left: 18px; font-size: 14px; }
  ul.addons li { padding: 3px 0; }
  .accept-btn {
    width: 100%; background: ${GLACIER}; color: ${DEEP_DARK}; border: none;
    font-family: 'Work Sans', sans-serif; font-weight: 600; font-size: 15.5px;
    padding: 15px; border-radius: 30px; cursor: pointer; margin-top: 6px;
  }
  .accept-btn:disabled { opacity: 0.6; cursor: default; }
  .status-msg { text-align: center; font-size: 13.5px; margin-top: 12px; min-height: 16px; color: ${MUTED}; }
  .accepted-badge {
    background: #EAF6EF; border: 1px solid #BFE3CC; color: #205C3B; font-size: 13.5px;
    padding: 12px 14px; border-radius: 10px; text-align: center; font-weight: 500;
  }
  .footer-note { text-align: center; font-size: 11.5px; color: ${MUTED}; margin-top: 20px; line-height: 1.6; }
</style>
</head>
<body>
<header>
  <p class="name">Waterline Lake Services</p>
  <p class="tag">YOUR QUOTE</p>
</header>
<div class="wrap">
  ${bodyHtml}
  <p class="footer-note">Questions? Call 317-258-8269 or email service@waterlinelakeservices.com.<br>No mileage surcharge across the Indiana lake communities we serve.</p>
</div>
</body>
</html>`;
}

function errorPage(message) {
  return page(
    `<div class="card"><h2>We couldn't find that quote</h2><p class="muted">${esc(message)}</p></div>`,
    'Quote not found'
  );
}

exports.handler = async function (event) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    console.error('AIRTABLE_TOKEN is not set on this Netlify project');
    return { statusCode: 500, headers: { 'Content-Type': 'text/html' }, body: errorPage('Something went wrong on our end. Please contact us directly.') };
  }

  const id = (event.queryStringParameters || {}).id;
  if (!id || !/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' }, body: errorPage('That link looks incomplete. Please ask us to resend it.') };
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

    const custName = (customer && customer.fields && customer.fields['Name']) || f['Name'] || 'there';
    const pkg = f['Package'] || 'Custom';
    const boatType = (boat && boat.fields && boat.fields['Boat Type']) || f['Boat Type'] || '';
    const boatLength = (boat && boat.fields && boat.fields['Length (ft)']) || f['Boat Length (ft)'];
    const total = f['Quoted Total'];
    const addOns = f['Add-ons'] || [];
    const pickup = f['Desired Pickup Date'];
    const status = (f['Status'] && f['Status'].name) || f['Status'] || '';
    const alreadyAccepted = String(status).toLowerCase().indexOf('accepted') !== -1
      || String(status).toLowerCase() === 'invoiced' || String(status).toLowerCase() === 'paid';

    const boatLine = [boatType, boatLength ? boatLength + ' ft' : ''].filter(Boolean).join(', ');

    const body = `
      <div class="card">
        <h2>Hi ${esc(custName)}, here's your quote</h2>
        <div class="row"><span>Package</span><b>${esc(pkg)}</b></div>
        ${boatLine ? `<div class="row"><span>Boat / PWC</span><b>${esc(boatLine)}</b></div>` : ''}
        ${pickup ? `<div class="row"><span>Desired pickup date</span><b>${esc(pickup)}</b></div>` : ''}
      </div>
      ${addOns.length ? `<div class="card"><h2>Add-ons included</h2><ul class="addons">${addOns.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      <div class="card">
        <div class="total-box"><span class="label">Total quote</span><span class="amt">${money(total)}</span></div>
        ${alreadyAccepted
          ? `<p class="accepted-badge">You've already accepted this quote — thank you! We'll be in touch to confirm scheduling.</p>`
          : `<button class="accept-btn" id="acceptBtn">Accept this quote</button>
             <p class="status-msg" id="statusMsg">By accepting, you're confirming you'd like us to move forward at the price above.</p>`
        }
      </div>
      ${alreadyAccepted ? '' : `
      <script>
        document.getElementById('acceptBtn').addEventListener('click', function () {
          var btn = this;
          var msg = document.getElementById('statusMsg');
          btn.disabled = true;
          msg.textContent = 'Submitting...';
          fetch('/api/accept-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: '${esc(id)}' })
          }).then(function (res) {
            if (!res.ok) { throw new Error('failed'); }
            btn.style.display = 'none';
            msg.innerHTML = '<b style="color:#205C3B;">Accepted!</b> Thanks — we\\'ve been notified and will follow up to confirm scheduling.';
          }).catch(function () {
            btn.disabled = false;
            msg.textContent = "That didn't go through — please call us at 317-258-8269 or try again.";
          });
        });
      </script>`}
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: page(body, 'Your Waterline Quote'),
    };
  } catch (err) {
    console.error('quote-page function error', err);
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html' },
      body: errorPage("This quote link isn't valid anymore. Please contact us and we'll resend it."),
    };
  }
};
