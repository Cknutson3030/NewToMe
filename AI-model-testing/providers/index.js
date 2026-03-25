const openai = require('./openai');
const google = require('./google');
const anthropic = require('./anthropic');
const xai = require('./xai');

const PROVIDERS = {
  openai,
  google,
  anthropic,
  xai
};

async function sendToProvider(provider, model, payload, opts = {}) {
  const p = (provider || 'openai').toLowerCase();
  const mod = PROVIDERS[p];
  if (!mod || typeof mod.send !== 'function') throw new Error('unsupported provider: ' + provider);
  return await mod.send(model, payload, opts);
}

// Unified callProvider: delegate to provider-specific callProvider when available,
// otherwise fall back to calling send with a Responses-style payload.
async function callProvider(provider, mapping, requestItems, schemaObj, sendToProviderFn, helpers = {}) {
  const p = (provider || 'openai').toLowerCase();
  const mod = PROVIDERS[p];
  if (mod && typeof mod.callProvider === 'function') {
    return await mod.callProvider(mapping, requestItems, schemaObj, sendToProviderFn || sendToProvider, helpers);
  }
  // fallback: build a generic payload and call send
  const payload = {
    model: mapping.model,
    input: requestItems,
    text: {
      format: {
        type: 'json_schema',
        name: schemaObj.name || 'image_analysis',
        strict: !!schemaObj.strict,
        schema: schemaObj.schema
      },
      verbosity: (helpers && helpers.getVerbosityForModel) ? helpers.getVerbosityForModel(mapping.model) : 'low'
    }
  };
  if (helpers && helpers.modelSupportsReasoning && helpers.modelSupportsReasoning(mapping.model)) payload.reasoning = { effort: (helpers && helpers.EFFECTIVE_REASONING_EFFORT) || 'low' };
  const start = Date.now();
  const body = await sendToProvider(mapping.provider || provider, mapping.model, payload, { timeoutMs: 120000 });
  const duration = Date.now() - start;
  const ai_response_slim = (()=>{ try{ const r = body; return { id: r.id, model: r.model, status: r.status, usage: r.usage || (r.ai_response && r.ai_response.usage) || null }; }catch(e){return null;} })();
  return { body, duration, ai_response_slim };
}

// Allow providers to parse their own responses into parsedOutput/sanitizedRaw/usage
async function parseResponse(provider, body) {
  const p = (provider || 'openai').toLowerCase();
  const mod = PROVIDERS[p];
  if (mod && typeof mod.parseResponse === 'function') {
    try { return await mod.parseResponse(body); } catch (e) { return null; }
  }
  return null;
}

module.exports = { sendToProvider, callProvider, parseResponse };
