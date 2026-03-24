const fetchWithRetry = require('../utils/fetchWithRetry');

// Gemini / Google Generative Language image understanding adapter
// Accepts a payload similar to the internal shape: { input: [ { role: 'user', content: [ { type: 'input_image', image_url }, { type: 'input_text', text } ] } ] }
// Produces a normalized object with `usage` (if available) and `predictions`/`candidates` passthrough.
async function send(model, payload, opts = {}) {
  // Support both GEMINI_API_KEY (preferred) and GOOGLE_API_KEY (legacy)
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:predict?key=${apiKey}`;

  // Build instances array expected by the Gemini predict endpoint
  const instances = [];
  try {
    const inputs = (payload && payload.input) ? payload.input : (Array.isArray(payload) ? payload : [payload]);
    // Each input item is expected to be a user message with content array
    for (const inItem of inputs) {
      const contents = (inItem && inItem.content) ? inItem.content : inItem;
      if (!contents) continue;
      // find prompt text and all images
      let promptText = null;
      const images = [];
      if (Array.isArray(contents)) {
        for (const c of contents) {
          if (!c) continue;
          if (c.type === 'input_text' && typeof c.text === 'string') promptText = c.text;
          if (c.type === 'input_image' && c.image_url) images.push(c.image_url);
        }
      } else if (typeof contents === 'string') {
        promptText = contents;
      }

      // If images exist, create one instance per image carrying the same prompt
      if (images.length > 0) {
        for (const img of images) {
          // If the image is a data URL, extract base64; otherwise use imageUri
          if (typeof img === 'string' && img.startsWith('data:')) {
            const parts = img.split(',');
            const b64 = parts[1] || '';
            instances.push({ input: { text: promptText || '' }, image: { imageBytes: b64 } });
          } else {
            instances.push({ input: { text: promptText || '' }, image: { imageUri: img } });
          }
        }
      } else {
        // No images: send a text-only instance
        instances.push({ input: { text: promptText || '' } });
      }
    }
  } catch (e) {
    // Fallback: send payload as-is
    instances.push({ input: { text: JSON.stringify(payload).slice(0, 10000) } });
  }

  const googlePayload = { instances };
  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googlePayload),
    timeoutMs: opts.timeoutMs || 120000
  });

  let body = null;
  try {
    body = await resp.json();
  } catch (e) {
    // If response is not valid JSON, capture raw text for debugging
    let text = '';
    try { text = await resp.text(); } catch (e2) { text = ''; }
    return { error: 'invalid_json', status: resp.status, statusText: resp.statusText, rawText: text, model, url, instancesCount: instances.length };
  }

  // Normalize token usage if present (Google may expose token metadata under `candidates`/`metadata` or top-level `metadata`)
  let usage = null;
  try {
    if (body && body.metadata) {
      usage = { input_tokens: body.metadata.promptTokens || null, output_tokens: body.metadata.completionTokens || null, total_tokens: body.metadata.totalTokens || null };
    } else if (Array.isArray(body.predictions) && body.predictions[0] && body.predictions[0].metadata) {
      const m = body.predictions[0].metadata;
      usage = { input_tokens: m.promptTokens || null, output_tokens: m.completionTokens || null, total_tokens: m.totalTokens || null };
    }
  } catch (e) { usage = null; }

  // Provide both raw body and a normalized `predictions` array for downstream parsing
  const out = Object.assign({}, body, { usage, model });
  return out;
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

// Basic parser for Gemini / Google responses. Attempts to extract structured
// JSON from `predictions` or candidate text fields and returns sanitized copy.
async function parseResponse(body) {
  if (!body || typeof body !== 'object') return { parsedOutput: null, sanitizedRaw: body, usage: (body && body.usage) ? body.usage : null };
  let parsed = null;
  try {
    if (Array.isArray(body.predictions) && body.predictions.length) {
      for (const p of body.predictions) {
        // Gemini may put text under `candidates` or `display` fields
        if (Array.isArray(p.candidates) && p.candidates.length) {
          for (const c of p.candidates) {
            if (c && typeof c === 'object') {
              if (c.content && typeof c.content === 'string') {
                try { parsed = JSON.parse(c.content); break; } catch (e) {}
              }
              if (c.text && typeof c.text === 'string') {
                try { parsed = JSON.parse(c.text); break; } catch (e) {}
              }
            } else if (typeof c === 'string') {
              try { parsed = JSON.parse(c); break; } catch (e) {}
            }
          }
        }
        // fallback: try parse any string fields
        for (const k of Object.keys(p)) {
          const v = p[k];
          if (typeof v === 'string' && !parsed) {
            try { parsed = JSON.parse(v); break; } catch (e) {}
          }
        }
        if (parsed) break;
      }
    }
  } catch (e) { parsed = null; }

  let sanitized = null;
  try { sanitized = JSON.parse(JSON.stringify(body)); } catch (e) { sanitized = body; }
  const usage = body.metadata || (body.predictions && body.predictions[0] && body.predictions[0].metadata) || null;
  return { parsedOutput: parsed, sanitizedRaw: sanitized, usage };
}

module.exports.parseResponse = parseResponse;

