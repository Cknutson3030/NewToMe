const fetchWithRetry = require('../utils/fetchWithRetry');

// Gemini / Google Generative Language image understanding adapter
// Accepts a payload similar to the internal shape: { input: [ { role: 'user', content: [ { type: 'input_image', image_url }, { type: 'input_text', text } ] } ] }
// Produces a normalized object with `usage` (if available) and `predictions`/`candidates` passthrough.
async function send(model, payload, opts = {}) {
  // Support both GEMINI_API_KEY (preferred) and GOOGLE_API_KEY (legacy)
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not set');
  // Legacy predict path (fallback)
  const predictUrl = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:predict?key=${apiKey}`;
  // Preferred generateContent path (v1beta)
  const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  // Build instances array expected by the Gemini predict endpoint.
  // Support multiple possible input shapes to maximize compatibility with
  // different Gemini model versions: include `input`, `image`, and a
  // `content` array with image/text items.
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
          const isData = (typeof img === 'string' && img.startsWith('data:'));
          const parts = isData ? img.split(',') : null;
          const b64 = parts ? (parts[1] || '') : null;
          // Preferred: content array with image + text
          const contentArr = [];
          if (isData) contentArr.push({ image: { imageBytes: b64 } }); else contentArr.push({ image: { imageUri: img } });
          contentArr.push({ text: promptText || '' });
          // Push both content-shaped instance and legacy-shaped instance to maximize compatibility
          if (isData) {
            instances.push({ content: contentArr, image: { imageBytes: b64 }, input: { text: promptText || '' } });
          } else {
            instances.push({ content: contentArr, image: { imageUri: img }, input: { text: promptText || '' } });
          }
        }
      } else {
        // No images: send a text-only instance
        instances.push({ content: [{ text: promptText || '' }], input: { text: promptText || '' } });
      }
    }
  } catch (e) {
    // Fallback: send payload as-is
    instances.push({ input: { text: JSON.stringify(payload).slice(0, 10000) }, content: [{ text: JSON.stringify(payload).slice(0, 10000) }] });
  }

  // Preserve other top-level fields (config, text, reasoning, etc.) so
  // structured-output settings reach the Gemini endpoint. Remove any `input`
  // key since we've already converted it into `instances`.
  const googlePayload = Object.assign({}, payload);
  try { delete googlePayload.input; } catch (e) {}
  googlePayload.instances = instances;

  // Helper to POST and return response
  const doPost = async (urlToPost, bodyObj) => {
    return await fetchWithRetry(urlToPost, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
      timeoutMs: opts.timeoutMs || 120000
    });
  };

  // Pre-build `contents` and `generationConfig` for generateContent so we
  // can try the v1beta endpoint even when model metadata is missing or v1
  // model info is not available for v1.
  const buildContents = () => {
    const contents = [];
    for (const inst of instances) {
      const contentObj = { parts: [] };
      if (inst.role) contentObj.role = inst.role;
      const parts = inst.content && Array.isArray(inst.content) ? inst.content : (inst.content ? [inst.content] : (inst.input && inst.input.text ? [ { text: inst.input.text } ] : []));
      for (const p of parts) {
        if (!p) continue;
        if (p.image && (p.image.imageBytes || p.image.imageUri)) {
          if (p.image.imageBytes) {
            contentObj.parts.push({ inlineData: { mimeType: (p.image.mimeType || 'image/jpeg'), data: p.image.imageBytes } });
          } else {
            contentObj.parts.push({ fileData: { fileUri: p.image.imageUri, mimeType: (p.image.mimeType || null) } });
          }
          continue;
        }
        if (p.image && p.image.imageUri) { contentObj.parts.push({ fileData: { fileUri: p.image.imageUri, mimeType: (p.image.mimeType || null) } }); continue; }
        if (typeof p.text === 'string') { contentObj.parts.push({ text: p.text }); continue; }
        if (typeof p === 'string') { contentObj.parts.push({ text: p }); continue; }
      }
      if (Array.isArray(contentObj.parts) && contentObj.parts.length) contents.push(contentObj);
    }
    return contents;
  };

  const prebuiltContents = buildContents();
  const generationConfig = Object.assign({}, googlePayload.config || {}, googlePayload.generationConfig || {});
  if (payload && payload.text && payload.text.format && payload.text.format.schema) {
    generationConfig.responseMimeType = generationConfig.responseMimeType || 'application/json';
    generationConfig._responseJsonSchema = payload.text.format.schema;
  }
  const genBody = Object.keys(generationConfig).length ? { contents: prebuiltContents, generationConfig } : { contents: prebuiltContents };

  // Try generateContent first (v1beta). If it fails (404 or other), fall back to v1 predict.
  let resp = null;
  try {
    // Only attempt generateContent when we have contents to send
    if (Array.isArray(prebuiltContents) && prebuiltContents.length) {
      try {
        resp = await doPost(genUrl, genBody);
        // If generateContent returned 404, try predict below
        if (resp && resp.status === 404) resp = null;
      } catch (e) {
        resp = null;
      }
    }
  } catch (e) {
    resp = null;
  }

  // Fallback to legacy predict endpoint when generateContent not used or failed
  if (!resp) {
    resp = await doPost(predictUrl, googlePayload);
    // If predict returned 404, attempt generateContent as a last resort
    if (resp && resp.status === 404 && Array.isArray(prebuiltContents) && prebuiltContents.length) {
      try {
        const tryGen = await doPost(genUrl, genBody);
        if (tryGen && tryGen.status !== 404) resp = tryGen;
      } catch (e) { /* ignore */ }
    }
  }

  let body = null;
  try {
    body = await resp.json();
  } catch (e) {
    // If response is not valid JSON, capture raw text for debugging
    let text = '';
    try { text = await resp.text(); } catch (e2) { text = ''; }
    const requestUrl = (resp && resp.url) ? resp.url : predictUrl;
    const debug = { error: 'invalid_json', status: resp && resp.status, statusText: resp && resp.statusText, rawText: text, model, url: requestUrl, instancesCount: instances.length };
    // If model not found (404), try to fetch model metadata for clearer diagnostics
    if (resp.status === 404) {
      try {
        const metaUrl = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}?key=${apiKey}`;
        const metaResp = await fetchWithRetry(metaUrl, { method: 'GET', timeoutMs: opts.timeoutMs || 60000 });
        let metaBody = null;
        try { metaBody = await metaResp.json(); } catch (e3) { metaBody = (await metaResp.text()).slice(0, 2000); }
        debug.modelInfo = { status: metaResp.status, statusText: metaResp.statusText, body: metaBody, url: metaUrl };
      } catch (metaErr) {
        debug.modelInfo = { error: 'model_info_fetch_failed', message: metaErr && (metaErr.message || String(metaErr)) };
      }
    }
    return debug;
  }

  // Normalize token usage if present (Google may expose token metadata under `candidates`/`metadata` or top-level `metadata`)
  let usage = null;
  try {
    if (body && body.metadata) {
      usage = { input_tokens: body.metadata.promptTokens || null, output_tokens: body.metadata.completionTokens || null, total_tokens: body.metadata.totalTokens || null };
    } else if (body && body.usageMetadata) {
      // generateContent returns a usageMetadata object with different field names
      usage = {
        input_tokens: body.usageMetadata.promptTokenCount || null,
        output_tokens: body.usageMetadata.candidatesTokenCount || null,
        total_tokens: body.usageMetadata.totalTokenCount || null
      };
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
  // Add config-level structured-output hints compatible with Gemini structured outputs
  // (SDK examples use response_mime_type + response_json_schema). Include both
  // to maximize compatibility with different Gemini versions.
  payload.config = payload.config || {};
  if (schemaObj && schemaObj.schema) {
    payload.config.response_mime_type = 'application/json';
    payload.config.response_json_schema = schemaObj.schema;
  }
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
    // Handle GenerateContent-style responses with `candidates[].content.parts[].text`
    if (Array.isArray(body.candidates) && body.candidates.length) {
      for (const cand of body.candidates) {
        if (!cand) continue;
        // candidate.content may be a Content object
        const content = cand.content || cand.content && cand.content.parts ? cand.content : null;
        if (content) {
          // parts may be under content.parts or content (if array)
          const partsArr = Array.isArray(content.parts) ? content.parts : (Array.isArray(content) ? content : null);
          if (Array.isArray(partsArr)) {
            for (const part of partsArr) {
              if (!part) continue;
              if (typeof part === 'string') {
                try { parsed = JSON.parse(part); break; } catch (e) {}
              }
              if (part && typeof part === 'object') {
                if (typeof part.text === 'string') {
                  try { parsed = JSON.parse(part.text); break; } catch (e) {}
                  // try to find JSON substring
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
        }
        // also try candidate.text or candidate.content if direct strings
        if (!parsed && typeof cand.text === 'string') {
          try { parsed = JSON.parse(cand.text); break; } catch (e) {}
        }
        if (!parsed && typeof cand.content === 'string') {
          try { parsed = JSON.parse(cand.content); break; } catch (e) {}
        }
      }
    }

    // Fallback: handle legacy `predictions` shape
    if (!parsed && Array.isArray(body.predictions) && body.predictions.length) {
      for (const p of body.predictions) {
        if (Array.isArray(p.candidates) && p.candidates.length) {
          for (const c of p.candidates) {
            if (typeof c === 'string') { try { parsed = JSON.parse(c); break; } catch (e) {} }
            if (c && typeof c === 'object') {
              if (typeof c.text === 'string') { try { parsed = JSON.parse(c.text); break; } catch (e) {} }
              if (typeof c.content === 'string') { try { parsed = JSON.parse(c.content); break; } catch (e) {} }
              if (Array.isArray(c.content)) {
                for (const part of c.content) {
                  if (!part) continue;
                  if (typeof part === 'string') { try { parsed = JSON.parse(part); break; } catch (e) {} }
                  if (part && typeof part === 'object') {
                    if (typeof part.text === 'string') { try { parsed = JSON.parse(part.text); break; } catch (e) {} }
                    if (typeof part.content === 'string') { try { parsed = JSON.parse(part.content); break; } catch (e) {} }
                  }
                }
                if (parsed) break;
              }
            }
          }
        }
        if (parsed) break;
      }
    }
  } catch (e) { parsed = null; }

  // sanitizedRaw: shallow clone with long text fields clipped for display
  let sanitized = null;
  try { sanitized = JSON.parse(JSON.stringify(body)); } catch (e) { sanitized = body; }
  try {
    if (sanitized && Array.isArray(sanitized.candidates)) {
      for (const cand of sanitized.candidates) {
        if (cand && cand.content && Array.isArray(cand.content.parts)) {
          for (const part of cand.content.parts) {
            if (part && typeof part.text === 'string' && part.text.length > 2000) part.text = part.text.slice(0, 1000) + '...';
          }
        }
      }
    }
  } catch (e) {}

  const usage = body.usage || body.usageMetadata || body.metadata || (body.predictions && body.predictions[0] && body.predictions[0].metadata) || null;
  return { parsedOutput: parsed, sanitizedRaw: sanitized, usage };
}

module.exports.parseResponse = parseResponse;

// Fetch list of available Gemini models for this API key (debug helper)
async function listModels(opts = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const resp = await fetchWithRetry(url, { method: 'GET', timeoutMs: opts.timeoutMs || 60000 });
  try {
    const body = await resp.json();
    return { status: resp.status, statusText: resp.statusText, body };
  } catch (e) {
    const text = await resp.text().catch(()=>'');
    return { status: resp.status, statusText: resp.statusText, rawText: text };
  }
}

module.exports.listModels = listModels;

