const fetchWithRetry = require('../utils/fetchWithRetry');

async function send(model, payload, opts = {}) {
  if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY not set');
  // x.ai expects requests to the /v1/responses endpoint with the model in the body
  const url = `https://api.x.ai/v1/responses`;
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: opts.timeoutMs || 120000
  });
  const body = await resp.json();
  const usage = body.usage || null;
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

// Basic parser for XAI / Grok responses. Attempts to extract structured
// JSON from common response shapes and returns a sanitized copy plus usage.
async function parseResponse(body) {
  if (!body || typeof body !== 'object') return { parsedOutput: null, sanitizedRaw: body, usage: (body && body.usage) ? body.usage : null };
  let parsed = null;
  try {
    // Prefer explicit parsed output
    if (body.output_parsed) parsed = body.output_parsed;

    // Handle `candidates` / `content.parts` style used by several providers
    if (!parsed && Array.isArray(body.candidates) && body.candidates.length) {
      for (const cand of body.candidates) {
        if (!cand) continue;
        const content = cand.content || (cand.content && cand.content.parts ? cand.content : null) || null;
        const partsArr = Array.isArray(content && content.parts ? content.parts : (Array.isArray(content) ? content : null)) ? (content.parts || content) : null;
        if (partsArr) {
          for (const part of partsArr) {
            if (!part) continue;
            if (typeof part === 'string') {
              try { parsed = JSON.parse(part); break; } catch (e) {}
            }
            if (part && typeof part === 'object') {
              if (typeof part.text === 'string') {
                try { parsed = JSON.parse(part.text); break; } catch (e) {}
                const first = part.text.indexOf('{');
                const last = part.text.lastIndexOf('}');
                if (first !== -1 && last !== -1 && last > first) {
                  const sub = part.text.slice(first, last + 1);
                  try { parsed = JSON.parse(sub); break; } catch (e) {}
                }
              }
              if (typeof part.content === 'string') {
                try { parsed = JSON.parse(part.content); break; } catch (e) {}
              }
            }
          }
          if (parsed) break;
        }

        // also try cand.text / cand.content as fallback
        if (!parsed && typeof cand.text === 'string') {
          try { parsed = JSON.parse(cand.text); break; } catch (e) {}
        }
        if (!parsed && typeof cand.content === 'string') {
          try { parsed = JSON.parse(cand.content); break; } catch (e) {}
        }
      }
    }

    // Fallback: handle Responses-style `output` arrays
    if (!parsed && Array.isArray(body.output)) {
      for (const item of body.output) {
        if (!item) continue;
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (!c) continue;
            if (c.type === 'structured_output') {
              parsed = c.value || c; break;
            }
            if (c.type === 'output_text' && typeof c.text === 'string') {
              try { parsed = JSON.parse(c.text); break; } catch (e) {}
              const first = c.text.indexOf('{');
              const last = c.text.lastIndexOf('}');
              if (first !== -1 && last !== -1 && last > first) {
                const sub = c.text.slice(first, last + 1);
                try { parsed = JSON.parse(sub); break; } catch (e) {}
              }
            }
          }
        }
        if (parsed) break;
      }
    }
  } catch (e) {
    parsed = null;
  }

  // sanitizedRaw: shallow clone with long text fields clipped for display
  let sanitized = null;
  try { sanitized = JSON.parse(JSON.stringify(body)); } catch (e) { sanitized = body; }
  try {
    if (sanitized && Array.isArray(sanitized.candidates)) {
      for (const cand of sanitized.candidates) {
        if (cand && cand.content && Array.isArray(cand.content.parts)) {
          for (const part of cand.content.parts) {
            if (part && typeof part.text === 'string' && part.text.length > 2000) part.text = part.text.slice(0, 1000) + '...';
            if (part && typeof part.content === 'string' && part.content.length > 2000) part.content = part.content.slice(0, 1000) + '...';
          }
        }
      }
    }
    if (sanitized && Array.isArray(sanitized.output)) {
      for (const item of sanitized.output) {
        if (item && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c && typeof c.text === 'string' && c.text.length > 2000) c.text = c.text.slice(0, 1000) + '...';
          }
        }
      }
    }
  } catch (e) { /* ignore sanitization errors */ }

  // Normalize usage if possible
  let usage = null;
  try {
    if (body && body.usage) usage = body.usage;
    else if (body && body.token_usage) usage = body.token_usage;
    else if (body && body.metadata) {
      usage = { input_tokens: body.metadata.promptTokens || null, output_tokens: body.metadata.completionTokens || null, total_tokens: body.metadata.totalTokens || null };
    }
  } catch (e) { usage = null; }

  return { parsedOutput: parsed, sanitizedRaw: sanitized, usage };
}

module.exports = { send, callProvider, parseResponse };
