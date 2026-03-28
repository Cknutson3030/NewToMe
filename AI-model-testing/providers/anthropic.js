const fetchWithRetry = require('../utils/fetchWithRetry');

function pickAnthropicVersion() {
  return (process.env.ANTHROPIC_API_VERSION && process.env.ANTHROPIC_API_VERSION.trim()) || '2023-06-01';
}

function mapInputToMessages(input) {
  if (!Array.isArray(input)) return input;
  return input.map((msg) => {
    const out = { role: msg.role || 'user', content: [] };
    if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (!c || !c.type) continue;
        // Normalize incoming tags: accept both 'input_text'/'text' and 'input_image'/'image'
        const t = (c.type || '').toString();
        if (t === 'input_text' || t === 'text') {
          out.content.push({ type: 'text', text: c.text || c.value || '' });
          continue;
        }
        if (t === 'input_image' || t === 'image') {
          const url = c.image_url || c.url || c.source?.url || '';
          if (typeof url === 'string' && url.startsWith('data:')) {
            const m = url.match(/^data:([^;]+);base64,(.*)$/);
            if (m) {
              out.content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
              continue;
            }
          }
          out.content.push({ type: 'image', source: { type: 'url', url } });
          continue;
        }
        if (typeof c === 'string') out.content.push({ type: 'text', text: c });
        else out.content.push(c);
      }
    }
    return out;
  });
}

async function send(model, payload, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY not set');
  const url = 'https://api.anthropic.com/v1/messages';

  const bodyObj = { model };
  if (payload.messages) bodyObj.messages = payload.messages;
  else if (payload.input) bodyObj.messages = mapInputToMessages(payload.input);

  if (payload.text && payload.text.format) {
    // Sanitize the format object to only send fields supported by the API
    const f = payload.text.format || {};
    const formatObj = { type: f.type || 'json_schema' };
    if (f.schema) formatObj.schema = f.schema;
    else if (f.json_schema) formatObj.schema = f.json_schema;
    bodyObj.output_config = { format: formatObj };
  }

  // Determine max_tokens: prefer explicit per-request value, then env fallback
  const envMax = process.env.ANTHROPIC_MAX_TOKENS ? parseInt(process.env.ANTHROPIC_MAX_TOKENS, 10) : NaN;
  const reqMax = (typeof payload.max_tokens === 'number' && isFinite(payload.max_tokens)) ? payload.max_tokens : NaN;
  const maxTokens = Number.isFinite(reqMax) ? reqMax : (Number.isFinite(envMax) ? envMax : undefined);
  if (typeof maxTokens === 'number') bodyObj.max_tokens = maxTokens;

  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': pickAnthropicVersion()
  };

  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj),
    timeoutMs: opts.timeoutMs || 120000
  });
  // Keep requests quiet here; callers may attach debug payloads if needed.

  const contentType = (resp.headers && resp.headers.get && resp.headers.get('content-type')) || '';
  const text = await resp.text();
  if (!contentType.includes('application/json')) {
    const err = new Error(`Anthropic returned non-JSON response: ${resp.status}`);
    err.status = resp.status;
    err.raw = text;
    throw err;
  }

  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    const err = new Error('Invalid JSON response from Anthropic');
    err.status = resp.status;
    err.raw = text;
    throw err;
  }
  const usage = parsed.usage || parsed.token_usage || null;
  return Object.assign({}, parsed, { usage, model });
}

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
  // If caller didn't set max_tokens, use env fallback if present.
  if (!payload.max_tokens) {
    const envMax = process.env.ANTHROPIC_MAX_TOKENS ? parseInt(process.env.ANTHROPIC_MAX_TOKENS, 10) : NaN;
    if (Number.isFinite(envMax)) payload.max_tokens = envMax;
  }
  if (helpers && helpers.modelSupportsReasoning && helpers.modelSupportsReasoning(mappedModel)) payload.reasoning = { effort: helpers.EFFECTIVE_REASONING_EFFORT };
  const start = Date.now();
  const body = await send(mappedModel, payload, { timeoutMs: 120000 });
  const duration = Date.now() - start;
  const ai_response_slim = (()=>{ try{ const r = body; return { id: r.id, model: r.model, status: r.status, usage: r.usage || (r.ai_response && r.ai_response.usage) || null }; }catch(e){return null;} })();
  return { body, duration, ai_response_slim };
}

// Minimal parser for Anthropic Messages responses. Attempts to extract structured JSON
async function parseResponse(body) {
  if (!body || typeof body !== 'object') return { parsedOutput: null, sanitizedRaw: body, usage: (body && body.usage) ? body.usage : null };
  let parsed = null;
  try {
    let found = false;
    if (body.parsed_output) parsed = body.parsed_output;
    if (!parsed && Array.isArray(body.content)) {
      for (const item of body.content) {
        if (!item) continue;
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c && c.type === 'structured_output') { parsed = c.value || c; found = true; break; }
            if (c && c.type === 'text' && typeof c.text === 'string') {
              try { parsed = JSON.parse(c.text); } catch (e) { parsed = parsed; }
              if (parsed) { found = true; break; }
            }
          }
          if (found) break;
        }
      }
    }
    // Also handle Anthropic-style `ai_response.content` arrays where the
    // model may embed JSON as a text block inside the assistant message.
    if (!parsed && body.ai_response && Array.isArray(body.ai_response.content)) {
      for (const item of body.ai_response.content) {
        if (!item) continue;
        if (item.type === 'structured_output' && item.value) { parsed = item.value; found = true; break; }
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (!c) continue;
            if (c.type === 'structured_output' && c.value) { parsed = c.value; found = true; break; }
            if (c.type === 'text' && typeof c.text === 'string') {
              try { const v = JSON.parse(c.text); if (v && typeof v === 'object') { parsed = v; found = true; break; } } catch (e) {}
            }
          }
          if (found) break;
        }
        if (item.type === 'text' && typeof item.text === 'string') {
          try { const v = JSON.parse(item.text); if (v && typeof v === 'object') { parsed = v; found = true; break; } } catch (e) {}
        }
        if (found) break;
      }
    }
  } catch (e) { parsed = null; }
  // Build a sanitized copy of the raw body and provide a Gemini-like
  // `candidates` array when Anthropic-style `ai_response.content` is present.
  let sanitized = null;
  try { sanitized = JSON.parse(JSON.stringify(body)); } catch (e) { sanitized = body; }

  try {
    // If ai_response.content exists, map it into a `candidates` array
    // with `content.parts[].text` entries (Gemini-like shape) so downstream
    // parsing and frontends that expect `candidates` can work uniformly.
    if (sanitized && sanitized.ai_response && Array.isArray(sanitized.ai_response.content)) {
      const candArr = [];
      for (const item of sanitized.ai_response.content) {
        if (!item) continue;
        const parts = [];
        // message style with nested content parts
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (!c) continue;
            if (c.type === 'text' && typeof c.text === 'string') parts.push({ text: c.text });
            else if (c.type === 'structured_output' && c.value) parts.push({ text: JSON.stringify(c.value) });
            else if (typeof c === 'string') parts.push({ text: c });
          }
        }
        // plain text block
        else if (item.type === 'text' && typeof item.text === 'string') {
          parts.push({ text: item.text });
        }
        // fallback: item.content.parts (some shapes use nested `parts`)
        else if (item.content && Array.isArray(item.content.parts)) {
          for (const p of item.content.parts) {
            if (!p) continue;
            if (typeof p === 'string') parts.push({ text: p });
            else if (p && typeof p.text === 'string') parts.push({ text: p.text });
          }
        }
        if (parts.length) candArr.push({ content: { parts }, role: 'model' });
      }
      if (candArr.length) sanitized.candidates = candArr;
    }

    // Map usage into a Gemini-style `usageMetadata` when possible
    const u = body && body.usage ? body.usage : null;
    if (sanitized && u && typeof u === 'object') {
      const promptTokenCount = (u.input_tokens != null ? u.input_tokens : (u.prompt_tokens != null ? u.prompt_tokens : null));
      const candidatesTokenCount = (u.output_tokens != null ? u.output_tokens : (u.completion_tokens != null ? u.completion_tokens : null));
      const totalTokenCount = (u.total_tokens != null ? u.total_tokens : null);
      sanitized.usageMetadata = sanitized.usageMetadata || {};
      if (promptTokenCount != null) sanitized.usageMetadata.promptTokenCount = Number(promptTokenCount);
      if (candidatesTokenCount != null) sanitized.usageMetadata.candidatesTokenCount = Number(candidatesTokenCount);
      if (totalTokenCount != null) sanitized.usageMetadata.totalTokenCount = Number(totalTokenCount);
    }
  } catch (e) { /* best-effort only */ }

  return { parsedOutput: parsed, sanitizedRaw: sanitized, usage: body.usage || null };
}

module.exports = { send, callProvider, parseResponse };
