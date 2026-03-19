// ============================================================
// QuickEstimate — Netlify Function: send-email.js
// Deploy to: netlify/functions/send-email.js
//
// Setup (you do this ONCE as the app owner):
// 1. Go to resend.com → create free account → get API key
// 2. Verify your domain: quickestimate.app
// 3. Netlify → Site Settings → Environment Variables → add:
//    RESEND_API_KEY = re_xxxxxxxxxxxxxxxxx
// 4. Redeploy — ALL your customers can now send email instantly
// ============================================================

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Email service not configured' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const { to, subject, html, from_name, reply_to } = body;
  if (!to || !subject || !html) return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing fields' }) };

  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (!emailOk(to)) return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Invalid email address' }) };

  try {
    const payload = {
      from: `${from_name || 'QuickEstimate'} <estimates@quickestimate.app>`,
      to: [to],
      subject,
      html,
      ...(reply_to && emailOk(reply_to) ? { reply_to } : {})
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || JSON.stringify(data));

    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true, id: data.id }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message }) };
  }
};
