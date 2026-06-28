const fs = require('fs');
const path = require('path');

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function readAgentFile(fileName) {
  const possiblePaths = [
    path.join(process.cwd(), 'agent', fileName),
    path.join(__dirname, '..', '..', 'agent', fileName),
    path.join(__dirname, '..', '..', '..', 'agent', fileName),
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch (_) {}
  }

  return '';
}

function buildFallbackInstructions() {
  return `You are the AI Business Coach for the Nevada Enterprise Business Center.
You are not a chatbot. You are an experienced Business Advisor.
Your mission is to help every business owner move one step closer to success during every conversation.
Determine the user's real objective, assess their business stage, explain why the issue matters, and provide three to five practical next steps.
Business stages: IDEA, STARTUP, ACTIVE BUSINESS, GROWTH, CONTRACT READY, SCALING.
Use plain English, headings, short paragraphs, and a calm professional tone.
Ask only one to three relevant questions when needed. Do not overwhelm the user.
Never guarantee grants, funding, contract awards, or business success.
Never provide legal, tax, or financial advice. Recommend appropriate professionals when needed.
Recommend Nevada Enterprise Business Center services only when genuinely relevant.
Available service areas: Business Assessment & Planning, Website Design Advisory, Contract Proposal Writing, Marketing & Promotions Advisory, Capital & Funding Advisory, Business Registration Advisory, Government Contract Opportunity Intelligence, Capability Statement Support, AI Automation Support, CRM and Customer Management Support.
Related systems: CapGen for federal opportunities, Nevada StateGen for Nevada state/local opportunities, California StateGen for California state/local opportunities, AI4 Website Design for website support.
General response format: Understanding, Assessment, Guidance, Action Plan, Business Center Services.`;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((msg) => msg && typeof msg.content === 'string')
    .slice(-8)
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content.slice(0, 4000),
    }));
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: 'Method not allowed.' }),
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: HEADERS,
        body: JSON.stringify({ ok: false, error: 'AI Coach is not configured. Missing OPENAI_API_KEY.' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const history = sanitizeMessages(body.history);

    if (!message) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ ok: false, error: 'Message is required.' }),
      };
    }

    const behaviorSpec = readAgentFile('AI_AGENT_COACH_BEHAVIOR_SPECIFICATION.md');
    const knowledgeSpec = readAgentFile('AI_AGENT_COACH_KNOWLEDGE_BASE_SPECIFICATION.md');
    const fallback = buildFallbackInstructions();

    const systemInstructions = [
      fallback,
      behaviorSpec ? `\nAPPROVED BEHAVIOR SPECIFICATION:\n${behaviorSpec}` : '',
      knowledgeSpec ? `\nAPPROVED KNOWLEDGE BASE SPECIFICATION:\n${knowledgeSpec}` : '',
      `\nIMPORTANT: You are serving visitors on the Nevada Enterprise Business Center website. Keep responses practical, advisor-like, and focused on the user's next best business step.`,
    ].join('\n\n');

    const input = [
      { role: 'system', content: systemInstructions },
      ...history,
      { role: 'user', content: message },
    ];

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input,
        temperature: 0.35,
        max_output_tokens: 900,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const detail = data && data.error && data.error.message ? data.error.message : 'OpenAI request failed.';
      return {
        statusCode: response.status,
        headers: HEADERS,
        body: JSON.stringify({ ok: false, error: detail }),
      };
    }

    const reply =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
            .map((part) => part.text || '')
            .join('\n')
            .trim()
        : '') ||
      'I am here to help. Tell me what you are trying to accomplish with your business today.';

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ok: true, reply }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: error.message || 'AI Coach request failed.' }),
    };
  }
};
