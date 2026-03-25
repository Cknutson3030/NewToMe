const fetchWithRetry = require('../utils/fetchWithRetry');

async function send(model, payload, opts = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const resp = await fetchWithRetry('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(Object.assign({}, payload, { model })),
    timeoutMs: opts.timeoutMs || 120000
  });
  const body = await resp.json();
  body.usage = body.usage || (body.ai_response && body.ai_response.usage) || null;
  body.model = body.model || model;
  return body;
}

module.exports = { send };

// Provider-level call wrapper used by server orchestration.
async function callProvider(mapping, requestItems, schemaObj, sendToProvider, helpers = {}) {
  // Reuse internal send implementation to perform the request.
  const mappedModel = mapping.model;
  const payload = {
    model: mappedModel,
    input: requestItems,
    text: {
      format: {
        type: 'json_schema',
        name: schemaObj.name || 'image_analysis',
        strict: !!schemaObj.strict,
        schema: schemaObj.schema
      },
      verbosity: (helpers && helpers.getVerbosityForModel) ? helpers.getVerbosityForModel(mappedModel) : 'low'
    }
  };
  if (helpers && helpers.modelSupportsReasoning && helpers.modelSupportsReasoning(mappedModel)) payload.reasoning = { effort: helpers.EFFECTIVE_REASONING_EFFORT };
  const start = Date.now();
  const body = await send(mappedModel, payload, { timeoutMs: 120000 });
  const duration = Date.now() - start;
  const ai_response_slim = (()=>{ try{ const r = body; return { id: r.id, model: r.model, status: r.status, usage: r.usage || (r.ai_response && r.ai_response.usage) || null }; }catch(e){return null;} })();
  return { body, duration, ai_response_slim };
}

module.exports = { send, callProvider };

// Parse Responses-style OpenAI body into sanitized + structured outputs
async function parseResponse(body) {
  if (!body || typeof body !== 'object') return { parsedOutput: null, sanitizedRaw: body, usage: (body && body.usage) ? body.usage : null };
  const extractStructured = (resp) => {
    try {
      if (resp.output_parsed) return resp.output_parsed;
      if (Array.isArray(resp.output)) {
        for (const item of resp.output) {
          if (item && item.type === 'message' && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (c && c.type === 'structured_output') {
                return c.value || c;
              }
              if (c && c.type === 'output_text' && typeof c.text === 'string') {
                try { return JSON.parse(c.text); } catch (e) {}
                const first = c.text.indexOf('{');
                const last = c.text.lastIndexOf('}');
                if (first !== -1 && last !== -1 && last > first) {
                  const sub = c.text.slice(first, last + 1);
                  try { return JSON.parse(sub); } catch (e) {}
                }
              }
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  };

  const parsed = extractStructured(body);
  // sanitizedRaw: shallow clone with large text fields removed
  let sanitized = null;
  try { sanitized = JSON.parse(JSON.stringify(body)); } catch (e) { sanitized = body; }
  try {
    if (Array.isArray(sanitized.output)) {
      for (const item of sanitized.output) {
        if (item && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c && c.type === 'output_text' && typeof c.text === 'string') {
              if (c.text.length > 2000) c.text = c.text.slice(0, 1000) + '...';
            }
          }
        }
      }
    }
  } catch (e) {}

  const usage = body.usage || (body.ai_response && body.ai_response.usage) || null;
  return { parsedOutput: parsed, sanitizedRaw: sanitized, usage };
}

module.exports.parseResponse = parseResponse;
