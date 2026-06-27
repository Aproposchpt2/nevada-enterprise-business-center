'use strict';

const { recommend } = require('./_recommend');
const PLATFORM = 'NEVADA ENTERPRISE BUSINESS CENTER™';

function clean(v, max = 800) { return String(v || '').trim().slice(0, max); }
function arr(v) { return Array.isArray(v) ? v.map(x => clean(x, 100)).filter(Boolean) : []; }
function intakeFrom(body) {
  const city = clean(body.city, 80);
  const state = clean(body.state, 80);
  return {
    fullName: clean(body.fullName || body.ownerName, 120),
    email: clean(body.email, 160).toLowerCase(),
    phone: clean(body.phone, 60),
    businessName: clean(body.businessName, 140) || 'Your Business',
    industry: clean(body.industry, 120),
    city,
    state,
    location: clean(body.location, 160) || [city, state].filter(Boolean).join(', '),
    businessStageInput: clean(body.businessStage || body.stage, 80) || 'not_sure',
    businessStatus: arr(body.businessStatus),
    servicesNeeded: arr(body.servicesNeeded),
    otherNeeds: clean(body.otherNeeds || body.idea || body.goal, 1200),
    targetCustomer: clean(body.targetCustomer || body.target, 700),
  };
}
function registered(i) {
  const s = new Set((i.businessStatus || []).map(x => String(x).toLowerCase()));
  return s.has('registered') || s.has('gov_regs');
}
function makeAccessCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}
function readiness(i, diagnosis) {
  const s = new Set(i.businessStatus);
  const r = registered(i);
  const total = (r ? 30 : 0) + (s.has('bank') ? 15 : 0) + (s.has('website') ? 15 : 0) + (s.has('social') ? 10 : 0) + (s.has('customers') ? 10 : 0) + (s.has('capability') ? 10 : 0);
  return { total, max: 100, rating: total >= 75 ? 'Strong Foundation' : total >= 50 ? 'Building Momentum' : total >= 25 ? 'Early Foundation' : 'Starting Point' };
}
function planText(i, diagnosis) {
  return `## Executive Summary\n${i.businessName} is using ${PLATFORM} to organize its business foundation, readiness score, action plan, and next growth steps.\n\n## Company Overview\nThe business operates in ${i.industry || 'its selected industry'}${i.location ? ' serving ' + i.location : ''}.\n\n## Products & Services\nThe first priority is to clarify the core offer and match services to the best customer or contract opportunities.\n\n## Market & Target Customer\nThe target customer should be defined by need, location, urgency, and ability to pay.\n\n## Competitive Edge\nThe business should lead with reliable execution, clear messaging, and a professional online presence.\n\n## Marketing & Sales Strategy\nUse a simple website, consistent outreach, and follow-up to convert attention into customers.\n\n## Operations\nDocument how inquiries, quotes, service delivery, payment, and follow-up will work.\n\n## Milestones & Roadmap\nFirst 7 days: complete missing foundation items. First 30 days: activate website and marketing. First 90 days: build a repeatable sales or contract pursuit system.\n\n## Financial Outline\nTrack startup costs, monthly expenses, expected sales volume, and break-even point.\n\n## Funding Needs\nTie any funding request to specific business uses such as equipment, marketing, inventory, website, staffing, or working capital.`;
}
function actionPlan(diagnosis) {
  const contracts = diagnosis.businessStage === 'WIN CONTRACTS';
  return [
    { week: 'Week 1', title: 'Foundation', items: ['Review your assessment.', 'Handle the first missing requirement.', 'Save your business plan.'] },
    { week: 'Week 2', title: 'Brand & Website', items: ['Clarify your message.', 'Start or update your website.', 'Prepare customer-facing content.'] },
    { week: 'Week 3', title: contracts ? 'Capability & Opportunities' : 'Marketing & Customers', items: contracts ? ['Prepare capability statement details.', 'Review registration requirements.', 'Review contract dashboards.'] : ['Create promotional messages.', 'Build an outreach list.', 'Use Morgan for next steps.'] },
    { week: 'Week 4', title: 'Launch & Optimization', items: ['Launch or promote the offer.', 'Collect feedback.', 'Refine the next 30-day plan.'] },
  ];
}
async function saveBasicMember(i, diagnosis, score) {
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) return { saved: false, error: 'Supabase env not configured' };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const H = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const base = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/biz_center_members`;
  const capgenAccess = registered(i);
  const code = capgenAccess ? makeAccessCode() : null;
  const row = { full_name: i.fullName, email: i.email, phone: i.phone || null, business_name: i.businessName, industry: i.industry, city: i.city, state: i.state, business_stage: diagnosis.businessStage, business_status: i.businessStatus, services_needed: i.servicesNeeded, readiness_score: score.total, subscription_status: 'trial', login_code: code, capgen_qualified: capgenAccess };
  const r = await fetch(base, { method: 'POST', headers: { ...H, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return { saved: r.ok, accessCode: code, capgenAccess, capgen_access: capgenAccess, capgenQualified: capgenAccess, capgen_qualified: capgenAccess };
}
exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad JSON' }) }; }
  const i = intakeFrom(body);
  if (!i.fullName || !i.email || !i.businessName || !i.industry || !i.city || !i.state) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please complete the required contact and business fields.' }) };
  const diagnosis = recommend({ businessStatus: i.businessStatus, servicesNeeded: i.servicesNeeded, businessStageInput: i.businessStageInput });
  const score = readiness(i, diagnosis);
  const plan = planText(i, diagnosis);
  const memberRecord = await saveBasicMember(i, diagnosis, score).catch(e => ({ saved: false, error: e.message, capgenAccess: false }));
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, mode: 'starter', emailSent: false, memberRecord, capgenAccess: !!memberRecord.capgenAccess, capgen_access: !!memberRecord.capgenAccess, capgenQualified: !!memberRecord.capgenAccess, capgen_qualified: !!memberRecord.capgenAccess, capgenAccessCode: memberRecord.accessCode || null, businessName: i.businessName, fullName: i.fullName, businessStage: diagnosis.businessStage, missingItems: diagnosis.missingItems, recommendedServices: diagnosis.recommendedServices, nextSteps: diagnosis.nextSteps, readiness: score, actionPlan: actionPlan(diagnosis), journey: [], serviceTimeline: { now: diagnosis.recommendedServices.slice(0, 5), later: diagnosis.recommendedServices.slice(5, 10) }, trial: { day: 1, daysTotal: 14, start: now.toISOString(), end: end.toISOString() }, plan, disclaimer: 'This plan and dashboard are AI-generated business guidance for planning purposes only.' }) };
};
