const fetchWithRetry = require('../utils/fetchWithRetry');

async function send(model, payload, opts = {}) {
  if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not set');
  const url = 'https://api.anthropic.com/v1/responses';
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY },
    body: JSON.stringify(Object.assign({}, payload, { model })),
    timeoutMs: opts.timeoutMs || 120000
  });
  const body = await resp.json();
  const usage = body.usage || body.token_usage || null;
  return Object.assign({}, body, { usage, model });
}

module.exports = { send };

async function callProvider(mapping, requestItems, schemaObj, sendToProvider, helpers = {}) {
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
