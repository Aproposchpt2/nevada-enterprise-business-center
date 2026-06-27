'use strict';

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'POST only' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Bad JSON' }) }; }

  const email = String(body.email || '').trim().toLowerCase();
  const accessCode = String(body.accessCode || '').trim().toUpperCase();
  if (!email || !accessCode) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Email and access code required.' }) };

  const supabaseUrl = String(process.env.BC_SUPA_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.BC_SUPA_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Member verification is not configured.' }) };
  }

  const select = 'id,full_name,email,business_name,industry,city,state,business_stage,readiness_score,subscription_status,trial_end,login_code,capgen_access_code,capgen_qualified';
  const url = `${supabaseUrl}/rest/v1/biz_center_members?email=eq.${encodeURIComponent(email)}&select=${select}`;

  const response = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  const rows = await response.json().catch(() => []);
  const member = Array.isArray(rows) ? rows[0] : null;

  if (!member) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'No Business Center membership found for this email.' }) };

  const loginCode = String(member.login_code || '').trim().toUpperCase();
  const capgenAccessCode = String(member.capgen_access_code || '').trim().toUpperCase();
  const validCode = accessCode === loginCode || accessCode === capgenAccessCode;

  if (!validCode) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'Invalid access code.' }) };

  if (!member.capgen_qualified) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'This Business Center member is not currently qualified for contract intelligence access.' }) };

  const status = String(member.subscription_status || '').toLowerCase();
  const trialEnd = member.trial_end ? new Date(member.trial_end) : null;
  const now = new Date();
  const active = ['active', 'trialing', 'trial', 'paid', 'comp'].includes(status) || (trialEnd && trialEnd > now);

  if (!active) return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'Your Business Center membership is inactive.' }) };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      member: {
        id: member.id,
        email: member.email,
        fullName: member.full_name || '',
        businessName: member.business_name || '',
        industry: member.industry || '',
        city: member.city || '',
        state: member.state || '',
        businessStage: member.business_stage || '',
        readinessScore: member.readiness_score || null,
        accessLevel: 'full',
        memberType: 'bc_member',
        platform: 'NEVADA ENTERPRISE™',
      },
    }),
  };
};
