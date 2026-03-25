require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Shared fetch helper and provider adapters are implemented in separate modules
const fetchWithRetry = require('./utils/fetchWithRetry');
const providers = require('./providers');

// Default generation parameters (configurable via env)
// Do not set a server-side default for max output tokens; allow the API to choose unless explicitly configured.
const DEFAULT_TEMPERATURE = process.env.TEMPERATURE ? Number(process.env.TEMPERATURE) : 0;
const DEFAULT_REASONING_EFFORT = (process.env.REASONING_EFFORT || 'low').toLowerCase();
// API supports verbosity: 'low' | 'medium' | 'high'. Default to 'low' to minimize tokens.
const DEFAULT_TEXT_VERBOSITY = (process.env.TEXT_VERBOSITY || 'low').toLowerCase();
// Validate and normalize generation parameter values to allowed lists
const normalizeReasoningEffort = (v) => {
  // Normalize to the provider-supported set: 'none', 'low', 'medium', 'high'
  if (!v || typeof v !== 'string') return 'low';
  const allowed = ['none','low','medium','high'];
  const s = v.toLowerCase();
  if (allowed.includes(s)) return s;
  // Map common synonyms/aliases
  if (s === 'minimal' || s === 'min' || s === 'minimal_effort') return 'low';
  if (s === 'none' || s === 'off' || s === 'zero') return 'none';
  if (s.startsWith('low')) return 'low';
  if (s.startsWith('med')) return 'medium';
  if (s.startsWith('high')) return 'high';
  return 'low';
};
const normalizeVerbosity = (v) => {
  if (!v || typeof v !== 'string') return 'low';
  const allowed = ['low','medium','high'];
  const s = v.toLowerCase();
  if (allowed.includes(s)) return s;
  return 'low';
};
const EFFECTIVE_REASONING_EFFORT = normalizeReasoningEffort(DEFAULT_REASONING_EFFORT);
const EFFECTIVE_TEXT_VERBOSITY = normalizeVerbosity(DEFAULT_TEXT_VERBOSITY);
const SLIM_RESPONSE = process.env.SLIM_RESPONSE === '1' || false;

// Models that do NOT accept `reasoning` parameter in the Responses API payload
const MODELS_WITHOUT_REASONING = ['gpt-4o','gpt-4o-mini'];
const modelSupportsReasoning = (modelId) => {
  if (!modelId || typeof modelId !== 'string') return false;
  for (const p of MODELS_WITHOUT_REASONING) if (modelId.startsWith(p)) return false;
  return true;
};

// Model-specific allowed verbosity mapping. If a model supports only a subset,
// map the requested verbosity to the nearest supported one.
const MODEL_VERBOSITY_OVERRIDES = {
  // gpt-4o family only supports 'medium'
  'gpt-4o': 'medium',
  'gpt-4o-mini': 'medium'
};
const getVerbosityForModel = (modelId) => {
  if (!modelId || typeof modelId !== 'string') return EFFECTIVE_TEXT_VERBOSITY;
  for (const prefix of Object.keys(MODEL_VERBOSITY_OVERRIDES)) {
    if (modelId.startsWith(prefix)) return MODEL_VERBOSITY_OVERRIDES[prefix];
  }
  return EFFECTIVE_TEXT_VERBOSITY;
};

// Startup debug info
console.log('Effective generation settings:', {
  REASONING_EFFORT: EFFECTIVE_REASONING_EFFORT,
  TEXT_VERBOSITY: EFFECTIVE_TEXT_VERBOSITY,
  SLIM_RESPONSE
});

// Map frontend product/model strings to provider + real model identifier
// NOTE: To test a different model in future experiments, edit the mapped `model` values below.
// Examples:
//  - To swap ChatGPT model for experiment: change the right-hand `model` for 'gpt-image-1' to another model id.
//  - To add a new model option: add a new key here and add the same key to the frontend `products` list in public/app.js.
const PROVIDER_MAP = {
  // gpt-4o and gpt-4o-mini are known for image analyze, GPT-5-mini (reasoning-focused) for tests reasoning vs vision tradeoff.
  // References: 
  // https://www.mdpi.com/2076-3417/14/17/7782
  // https://arxiv.org/abs/2507.01955
  // https://aimlapi.com/comparisons/llama-3-2-90b-vision-vs-gpt-4o-vision
  ChatGPT: {
    'Reasoning-focused': { provider: 'openai', model: 'gpt-5.4' },
    'Balanced (reasoning and vision)': { provider: 'openai', model: 'gpt-4o' },
    'Low reasoning / vision baseline': { provider: 'openai', model: 'gpt-4o-mini' }
  },
  // gemini-3.1-pro-preview (reasoning-focused) has a deep dynamic thinking budget. 
  // gemini-2.5-flash is the balanced tradeoff between reasoning and vision.
  // gemini-2.5-flash-lite (pure vision) has thinking disabled by default, acting as the control group.
  // References: 
  // https://arxiv.org/abs/2403.05530
  // https://arxiv.org/abs/2507.06261
  // https://arxiv.org/abs/2509.17177
  // https://flageval-baai.github.io/LRM-Eval/
  Gemini: {
    'Reasoning-focused': { provider: 'google', model: 'gemini-3.1-pro-preview' }, 
    'Balanced (reasoning and vision)': { provider: 'google', model: 'gemini-2.5-flash' },
    'Low reasoning / vision baseline': { provider: 'google', model: 'gemini-2.5-flash-lite' }
  },
  Claude: {
    'claude-image-1': { provider: 'anthropic', model: 'claude-image-1' },
    'claude-image-2': { provider: 'anthropic', model: 'claude-image-2' },
    'claude-image-3': { provider: 'anthropic', model: 'claude-image-3' }
  },
  Grok: {
    'grok-image-1': { provider: 'xai', model: 'grok-image-1' },
    'grok-image-2': { provider: 'xai', model: 'grok-image-2' },
    'grok-image-3': { provider: 'xai', model: 'grok-image-3' }
  }
};

// Use upload.any() so the server accepts files regardless of the field name used
// by the browser (drag/drop libraries or native input may use different names).
app.post('/submit', upload.any(), async (req, res) => {
  let cleanupSavedFiles = async () => {};
  try {
    // receive files and metadata
    // With upload.any(), multer places all files in req.files as an array.
    const files = req.files || [];
    const { product, model } = req.body;
    if (!files.length) return res.status(400).json({ error: 'no images uploaded' });

    // save uploaded images to local uploads dir and build public URLs
    const savedUrls = [];
    const savedPaths = [];
    const savedDataUrls = [];
    for (const f of files) {
      // only accept image mimetypes
      if (!f.mimetype || !f.mimetype.startsWith('image/')) continue;
      const name = `${Date.now()}-${f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const outPath = path.join(uploadsDir, name);
      fs.writeFileSync(outPath, f.buffer);
      savedPaths.push(outPath);
      const publicUrl = `${req.protocol}://${req.get('host')}/uploads/${name}`;
      savedUrls.push(publicUrl);
      // create a base64 data URL so the upstream API does not try to fetch localhost URLs
      const base64 = f.buffer.toString('base64');
      savedDataUrls.push(`data:${f.mimetype};base64,${base64}`);
    }

    // helper to remove saved files for this request
    cleanupSavedFiles = async () => {
      for (const p of savedPaths) {
        try { await fs.promises.unlink(p); } catch (e) { console.warn('cleanup failed', p, e && e.message); }
      }
    };

    // Structured Outputs JSON Schema for lifecycle assessment (copied from user's Python prompt schema)
    const schemaObj = {
      name: 'structured_information_response',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          functional_unit: { type: 'string' },
          life_cycle_emissions: {
            type: 'object',
            additionalProperties: false,
            properties: {
              raw_material_extraction: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                },
                required: ['kg_co2e']
              },
              manufacturing: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                },
                required: ['kg_co2e']
              },
              transportation_distribution: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                },
                required: ['kg_co2e']
              },
              use_phase: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                },
                required: ['kg_co2e']
              },
              end_of_life: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                },
                required: ['kg_co2e']
              }
            },
            required: ['raw_material_extraction','manufacturing','transportation_distribution','use_phase','end_of_life']
          }
        },
        required: ['functional_unit','life_cycle_emissions']
      }
    };

    // Shared prompt template used for all providers and experiments.
    // Keep the template here so every experiment uses the exact same instruction text.
    // Use `{product}` and `{model}` placeholders which will be replaced at runtime.
     const PROMPT_TEMPLATE = `
  You are a sustainability and life-cycle assessment expert following ISO 14067 principles:
  - Life-cycle perspective
  - Transparency
  - No misleading precision
  - Consistent system boundaries
  (Carbon Footprint of Products).

  DATA SOURCES ONLY FROM HERE:
  https://www.climatiq.io/data/source/openio_canada
  https://ghgprotocol.org/Third-Party-Databases/Canadian-Raw-Materials-Database
  https://www.canada.ca/en/environment-climate-change/services/managing-pollution/fuel-life-cycle-assessment-model.html
  https://www.canada.ca/en/environment-climate-change/services/climate-change/pricing-pollution-how-it-will-work/output-based-pricing-system/federal-greenhouse-gas-offset-system/emission-factors-reference-values.html
  https://uwaterloo.ca/canadian-raw-materials-database/life-cycle-inventory-databasesbases-donnees-linventaire
  https://publications.gc.ca/site/eng/9.955129/publication.html
  https://eeecc.nrc-cnrc.gc.ca/en/life-cycle-inventory-warehouse
  https://www.canada.ca/en/environment-climate-change/services/environmental-indicators/greenhouse-gas-emissions.html
  https://www.ipcc-nggip.iges.or.jp/public/2006gl/index.html
  https://www.canada.ca/en/treasury-board-secretariat/services/innovation/greening-government/government-canada-greenhouse-gas-emissions-inventory.html
  https://publications.gc.ca/collections/collection_2022/eccc/En14-493-1-2022-eng.pdf
  https://www.canada.ca/en/environment-climate-change/services/managing-pollution/fuel-life-cycle-assessment-model/methodology.html

  Analyze the provided images and perform the following tasks:

  1. Assume a functional unit of:
    "One unit of the identified product, suitable for its intended use."

  2. Using reasonable, transparent assumptions and publicly accepted
  life-cycle emission factors (e.g. industry averages, IPCC-aligned values),
  estimate greenhouse gas emissions (kg CO₂e) for EACH of the following
  life-cycle stages:

    a. Raw material extraction  
    b. Manufacturing / processing  
    c. Transportation & distribution  
    d. Use phase  
    e. End-of-life

  3. Output the results in a structured JSON object conforming to the provided schema.

  4. For each stage, include:
    - Estimated emissions (kg CO₂e)
  `;

    // Resolve provider and model mapping based on frontend selections
    const mapping = (PROVIDER_MAP[product] || {})[model];

    // Build request items: a single `user` item whose `content` is an array
    // containing image items followed by the user prompt as an `input_text` item.
    const imageItems = savedDataUrls.map((u) => ({ type: 'input_image', image_url: u }));
    const resolvedModelForPrompt = mapping?.model || model;
    const finalPrompt = PROMPT_TEMPLATE.replace('{product}', product).replace('{model}', resolvedModelForPrompt);
    const requestItems = [
      {
        role: 'user',
        content: [
          ...imageItems,
          { type: 'input_text', text: finalPrompt }
        ]
      }
    ];

    // Helper: normalize and expose usage with explicit input_tokens/output_tokens fields
    const extractNormalizedUsage = (rawBody) => {
      try {
        const usage = (rawBody && rawBody.usage) ? rawBody.usage : (rawBody && rawBody.ai_response && rawBody.ai_response.usage) ? rawBody.ai_response.usage : (rawBody && rawBody.ai_response_slim && rawBody.ai_response_slim.usage) ? rawBody.ai_response_slim.usage : null;
        if (!usage || typeof usage !== 'object') return { input_tokens: null, output_tokens: null, total_tokens: null };
        const input_tokens = (usage.input_tokens != null ? usage.input_tokens : (usage.prompt_tokens != null ? usage.prompt_tokens : null));
        const output_tokens = (usage.output_tokens != null ? usage.output_tokens : (usage.completion_tokens != null ? usage.completion_tokens : null));
        const total_tokens = (usage.total_tokens != null ? usage.total_tokens : null);
        return { input_tokens: input_tokens == null ? null : Number(input_tokens), output_tokens: output_tokens == null ? null : Number(output_tokens), total_tokens: total_tokens == null ? null : Number(total_tokens) };
      } catch (e) { return { input_tokens: null, output_tokens: null, total_tokens: null }; }
    };

    // If mapping not found, fallback to treating `model` as an OpenAI model id
    if (!mapping) {
      if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
      const startTime = Date.now();
      // build payload and omit `reasoning` for models that don't support it
      const payloadObj = {
        model: model || 'MODEL_NAME',
        input: requestItems,
        text: {
          format: {
            type: 'json_schema',
            name: schemaObj.name || 'image_analysis',
            strict: !!schemaObj.strict,
            schema: schemaObj.schema
          },
          verbosity: getVerbosityForModel(model || 'MODEL_NAME')
        }
      };
      if (modelSupportsReasoning(payloadObj.model)) payloadObj.reasoning = { effort: EFFECTIVE_REASONING_EFFORT };
      const body = await providers.sendToProvider('openai', payloadObj.model || model, payloadObj, { timeoutMs: 120000 });
      // Log token usage for tuning
      try { console.log('response usage', body.usage || (body.ai_response && body.ai_response.usage) || null); } catch(e){}
      // If the response indicates it was cut off by max_output_tokens, retry once with a larger cap
      let ai_response_slim = null;
      let duration = Date.now() - startTime;
      try {
        ai_response_slim = (()=>{ try{ const r = body; return { id: r.id, model: r.model, status: r.status, usage: r.usage || (r.ai_response && r.ai_response.usage) || null }; }catch(e){return null;} })();
      } catch(e){}
      const needsRetry = (body && (body.incomplete_details && body.incomplete_details.reason === 'max_output_tokens')) || (body && body.status === 'incomplete' && body.incomplete_details && body.incomplete_details.reason === 'max_output_tokens');
      if (needsRetry) {
        try {
          console.log('retrying response without max_output_tokens (let API default)');
          const retryStart = Date.now();
          const retryPayload = {
            model: model || 'MODEL_NAME',
            input: requestItems,
            text: {
              format: {
                type: 'json_schema',
                name: schemaObj.name || 'image_analysis',
                strict: !!schemaObj.strict,
                schema: schemaObj.schema
              },
              verbosity: getVerbosityForModel(model || 'MODEL_NAME')
            }
          };
          if (modelSupportsReasoning(retryPayload.model)) retryPayload.reasoning = { effort: EFFECTIVE_REASONING_EFFORT };
          const retryBody = await providers.sendToProvider('openai', retryPayload.model || model, retryPayload, { timeoutMs: 120000 });
          duration += (Date.now() - retryStart);
          console.log('retry response usage', retryBody.usage || (retryBody.ai_response && retryBody.ai_response.usage) || null);
          // prefer the retry body if it looks usable
          if (retryBody && (retryBody.status === 'completed' || !(retryBody.incomplete_details && retryBody.incomplete_details.reason === 'max_output_tokens'))) {
            Object.assign(body, retryBody);
            ai_response_slim = (()=>{ try{ const r = retryBody; return { id: r.id, model: r.model, status: r.status, usage: r.usage || (r.ai_response && r.ai_response.usage) || null }; }catch(e){return null;} })();
          }
        } catch (e) { console.warn('retry failed', e && e.message); }
      }
        // try to extract a parsed structured output when available (robust)
        const parseStructuredOutput = (resp) => {
          try {
            if (!resp) return null;
            if (resp.output_parsed) return resp.output_parsed;
            if (Array.isArray(resp.output)) {
              for (const item of resp.output) {
                if (item && item.type === 'message' && Array.isArray(item.content)) {
                  for (const c of item.content) {
                    // structured_output may contain the parsed JSON in `value` or similar
                    if (c && c.type === 'structured_output') {
                      if (c.value) return c.value;
                      return c;
                    }
                    if (c && c.type === 'output_text' && typeof c.text === 'string') {
                      // try direct parse
                      try { return JSON.parse(c.text); } catch (e) {}
                      // fallback: extract first {...} block and try parse
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
          } catch (e) { console.warn('parseStructuredOutput error', e && e.message); }
          return null;
        };
        // Allow provider to parse its own response shape first
        let parsedOutputFromProvider = null;
        try { parsedOutputFromProvider = await providers.parseResponse('openai', body); } catch (e) { parsedOutputFromProvider = null; }
        let parsedOutput = (parsedOutputFromProvider && parsedOutputFromProvider.parsedOutput) ? parsedOutputFromProvider.parsedOutput : parseStructuredOutput(body);
        const removeKeysDeep = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) return obj.forEach(removeKeysDeep);
          for (const k of Object.keys(obj)) {
            if (KEYS_TO_REMOVE.includes(k)) {
              delete obj[k];
              continue;
            }
            removeKeysDeep(obj[k]);
          }
        };
        const sanitizeParsed = (p) => {
          if (!p || typeof p !== 'object') return p;
          try {
            const clone = JSON.parse(JSON.stringify(p));
            removeKeysDeep(clone);
            return clone;
          } catch (e) { return p; }
        };
        parsedOutput = sanitizeParsed(parsedOutput);
        // Also create a sanitized copy of the raw API body to return to the frontend
        const sanitizeRawResponse = (raw) => {
          if (!raw || typeof raw !== 'object') return raw;
          let clone;
          try { clone = JSON.parse(JSON.stringify(raw)); } catch (e) { return raw; }
          try {
            if (Array.isArray(clone.output)) {
              for (const item of clone.output) {
                if (item && Array.isArray(item.content)) {
                  for (const c of item.content) {
                    if (!c) continue;
                    if (c.type === 'output_text' && typeof c.text === 'string') {
                      try {
                        const maybe = JSON.parse(c.text);
                        removeKeysDeep(maybe);
                        c.text = JSON.stringify(maybe);
                      } catch (e) {
                        // fallback: remove key/value patterns for the keys from the raw text
                        let s = c.text;
                        for (const key of KEYS_TO_REMOVE) {
                          const re = new RegExp(`"\\s*${key}\\s*"\\s*:\\s*(?:"[^"]*"|\\{[^\\}]*\\}|\\[[^\\]]*\\]|[^,\\}\\]]*)(,)?`, 'gi');
                          s = s.replace(re, (m, comma) => comma ? '' : '');
                        }
                        s = s.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/\{\s*,/g, '{').replace(/\[\s*,/g, '[');
                        c.text = s;
                      }
                    } else if (c.type === 'structured_output' && c.value) {
                      removeKeysDeep(c.value);
                    }
                  }
                }
              }
            }
          } catch (e) { /* ignore */ }
          return clone;
        };
        let sanitizedRaw = null;
        try {
          const providerSanitized = parsedOutputFromProvider && parsedOutputFromProvider.sanitizedRaw ? parsedOutputFromProvider.sanitizedRaw : null;
          sanitizedRaw = providerSanitized ? providerSanitized : sanitizeRawResponse(body);
          // Ensure ai_response.usage exposes explicit input/output token fallbacks
          const normalized = extractNormalizedUsage(body || sanitizedRaw);
          if (sanitizedRaw && typeof sanitizedRaw === 'object') sanitizedRaw.usage = Object.assign({}, sanitizedRaw.usage || {}, normalized);
        } catch (e) { sanitizedRaw = sanitizeRawResponse(body); }
        // unwrap single-key wrapper objects (e.g., { structured_information_response: { ... } })
        try {
          if (parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
            const keys = Object.keys(parsedOutput);
            if (keys.length === 1) {
              const inner = parsedOutput[keys[0]];
              if (inner && typeof inner === 'object' && inner.life_cycle_emissions) parsedOutput = inner;
            }
          }
        } catch(e) { /* ignore */ }

      // build lifecycle summary fields from parsed output when available
      const normalizeStageValue = (val) => {
        if (val == null) return null;
        // If it's already a number, return it
        if (typeof val === 'number' && Number.isFinite(val)) return val;
        // If it's an object with kg_co2e field
        if (typeof val === 'object') {
          const candidates = ['kg_co2e', 'kg_co2e_value', 'value', 'amount'];
          for (const k of candidates) {
            if (k in val) {
              const v = val[k];
              if (typeof v === 'number' && Number.isFinite(v)) return v;
              if (typeof v === 'string') {
                const m = v.match(/([-+]?[0-9]*\.?[0-9]+)/);
                if (m) return Number(m[0]);
              }
            }
          }
          // try top-level numeric-like string on object
          try {
            const s = JSON.stringify(val);
            const m = s.match(/([-+]?[0-9]*\.?[0-9]+)/);
            if (m) return Number(m[0]);
          } catch (e) {}
          return null;
        }
        // If it's a string, try extract number
        if (typeof val === 'string') {
          const m = val.match(/([-+]?[0-9]*\.?[0-9]+)/);
          if (m) return Number(m[0]);
          return null;
        }
        return null;
      };

      const lc = parsedOutput && parsedOutput.life_cycle_emissions ? parsedOutput.life_cycle_emissions : parsedOutput || {};
      // Support several possible shapes: nested objects with .kg_co2e, direct numbers, or strings
      const rm_raw = lc?.raw_material_extraction ?? parsedOutput?.raw_material_extraction ?? parsedOutput?.raw_material ?? null;
      const manu_raw = lc?.manufacturing ?? parsedOutput?.manufacturing ?? parsedOutput?.manufacturing_process ?? null;
      const trans_raw = lc?.transportation_distribution ?? parsedOutput?.transportation_distribution ?? parsedOutput?.transportation ?? null;
      const usep_raw = lc?.use_phase ?? parsedOutput?.use_phase ?? parsedOutput?.use ?? null;
      const eol_raw = lc?.end_of_life ?? parsedOutput?.end_of_life ?? parsedOutput?.end_of_life_stage ?? null;

      const rm = normalizeStageValue(rm_raw);
      const manu = normalizeStageValue(manu_raw);
      const trans = normalizeStageValue(trans_raw);
      const usep = normalizeStageValue(usep_raw);
      const eol = normalizeStageValue(eol_raw);

      const total = [rm, manu, trans, usep, eol].reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
      const result = {
        time: new Date().toISOString(),
        product,
        model: model,
        raw_material_extraction: rm,
        manufacturing: manu,
        transportation_distribution: trans,
        use_phase: usep,
        end_of_life: eol,
        total: Number.isFinite(total) ? total : null,
        processing_time_ms: duration,
        ai_response: sanitizedRaw,
        ai_response_slim,
        ai_parsed: parsedOutput,
        ai_parsed_normalized: {
          raw_material_extraction: rm,
          manufacturing: manu,
          transportation_distribution: trans,
          use_phase: usep,
          end_of_life: eol,
          total: Number.isFinite(total) ? total : null
        }
      };
      // Build ChatGPT-like message wrapper for frontend compatibility
      try {
        const prettyText = parsedOutput ? (typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput, null, 2)) : (sanitizedRaw && sanitizedRaw.candidates && sanitizedRaw.candidates[0] && sanitizedRaw.candidates[0].content ? (sanitizedRaw.candidates[0].content.parts ? (sanitizedRaw.candidates[0].content.parts.map(p=>p.text||'').join('\n')) : (sanitizedRaw.candidates[0].content.text||'') ) : null);
        result.chat = { messages: [ { role: 'assistant', content: { type: 'structured', structured: parsedOutput || null, text: prettyText } } ] };
      } catch (e) { /* ignore chat wrapper errors */ }
      await cleanupSavedFiles();
      return res.json(result);
    }

    // Delegate provider call to providers, which now expose a `callProvider`
    // entrypoint that encapsulates provider-specific logic.
    const providers = require('./providers');
    let body, duration, ai_response_slim;
    try {
      const result = await providers.callProvider(mapping.provider, mapping, requestItems, schemaObj, providers.sendToProvider, { modelSupportsReasoning, getVerbosityForModel, EFFECTIVE_REASONING_EFFORT, EFFECTIVE_TEXT_VERBOSITY });
      body = result.body;
      duration = result.duration;
      ai_response_slim = result.ai_response_slim;
    } catch (e) {
      console.warn('provider handler failed', mapping.provider, e && e.message);
      await cleanupSavedFiles();
      return res.status(501).json({ error: 'provider_not_implemented', provider: mapping.provider, mapping, message: e && e.message });
    }
    try { console.log('response usage', body.usage || (body.ai_response && body.ai_response.usage) || null); } catch(e){}
    // attempt to extract parsed structured output (robust helper)
    const parseStructuredOutput = (resp) => {
      try {
        if (!resp) return null;
        if (resp.output_parsed) return resp.output_parsed;
        if (Array.isArray(resp.output)) {
          for (const item of resp.output) {
            if (item && item.type === 'message' && Array.isArray(item.content)) {
              for (const c of item.content) {
                if (c && c.type === 'structured_output') {
                  if (c.value) return c.value;
                  return c;
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
      } catch (e) { console.warn('parseStructuredOutput error', e && e.message); }
      return null;
    };
      // Provider-specific parsing (allows OpenAI/Gemini to expose their own structure)
      let parsedOutputFromProvider = null;
      try { parsedOutputFromProvider = await providers.parseResponse(mapping.provider, body); } catch (e) { parsedOutputFromProvider = null; }
      let parsedOutput = (parsedOutputFromProvider && parsedOutputFromProvider.parsedOutput) ? parsedOutputFromProvider.parsedOutput : parseStructuredOutput(body);
        // sanitize parsed output: remove verbose fields the frontend doesn't need
        const KEYS_TO_REMOVE = ['assumptions','coefficent','coefficient'];
        const removeKeysDeep = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) return obj.forEach(removeKeysDeep);
          for (const k of Object.keys(obj)) {
            if (KEYS_TO_REMOVE.includes(k)) {
              delete obj[k];
              continue;
            }
            removeKeysDeep(obj[k]);
          }
        };
        const sanitizeParsed = (p) => {
          if (!p || typeof p !== 'object') return p;
          try {
            const clone = JSON.parse(JSON.stringify(p));
            removeKeysDeep(clone);
            return clone;
          } catch (e) { return p; }
        };
        parsedOutput = sanitizeParsed(parsedOutput);
    try {
      if (parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
        const keys = Object.keys(parsedOutput);
        if (keys.length === 1) {
          const inner = parsedOutput[keys[0]];
          if (inner && typeof inner === 'object' && inner.life_cycle_emissions) parsedOutput = inner;
        }
      }
    } catch(e) { /* ignore */ }

    // Create a sanitized copy of the raw API body (remove verbose text fields)
    const sanitizeRawResponse = (raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      let clone;
      try { clone = JSON.parse(JSON.stringify(raw)); } catch (e) { return raw; }
      try {
        if (Array.isArray(clone.output)) {
          for (const item of clone.output) {
            if (item && Array.isArray(item.content)) {
              for (const c of item.content) {
                if (!c) continue;
                if (c.type === 'output_text' && typeof c.text === 'string') {
                  try {
                    const maybe = JSON.parse(c.text);
                    removeKeysDeep(maybe);
                    c.text = JSON.stringify(maybe);
                  } catch (e) {
                    let s = c.text;
                    for (const key of KEYS_TO_REMOVE) {
                      const re = new RegExp(`"\\s*${key}\\s*"\\s*:\\s*(?:"[^"]*"|\\{[^\\}]*\\}|\\[[^\\]]*\\]|[^,\\}\\]]*)(,)?`, 'gi');
                      s = s.replace(re, (m, comma) => comma ? '' : '');
                    }
                    s = s.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/\{\s*,/g, '{').replace(/\[\s*,/g, '[');
                    c.text = s;
                  }
                } else if (c.type === 'structured_output' && c.value) {
                  removeKeysDeep(c.value);
                }
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
      return clone;
    };
    // If provider returned a sanitizedRaw, use it; otherwise sanitize here
    const providerParseResult = parsedOutputFromProvider;
    let sanitizedRaw = providerParseResult && providerParseResult.sanitizedRaw ? providerParseResult.sanitizedRaw : sanitizeRawResponse(body);
    // If provider provided usage, merge normalized usage
    try {
      const normalized = extractNormalizedUsage(body || sanitizedRaw);
      if (sanitizedRaw && typeof sanitizedRaw === 'object') sanitizedRaw.usage = Object.assign({}, sanitizedRaw.usage || {}, normalized);
    } catch (e) { /* ignore */ }
    // Ensure ai_response.usage exposes explicit input/output token fallbacks
    try {
      const normalized = extractNormalizedUsage(body || sanitizedRaw);
      if (sanitizedRaw && typeof sanitizedRaw === 'object') sanitizedRaw.usage = Object.assign({}, sanitizedRaw.usage || {}, normalized);
    } catch (e) { /* ignore */ }

    // build lifecycle summary fields from parsed output when available
    // Normalize values (same logic as above branch)
    const normalizeStageValue = (val) => {
      if (val == null) return null;
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      if (typeof val === 'object') {
        const candidates = ['kg_co2e', 'kg_co2e_value', 'value', 'amount'];
        for (const k of candidates) {
          if (k in val) {
            const v = val[k];
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string') {
              const m = v.match(/([-+]?[0-9]*\.?[0-9]+)/);
              if (m) return Number(m[0]);
            }
          }
        }
        try { const s = JSON.stringify(val); const m = s.match(/([-+]?[0-9]*\.?[0-9]+)/); if (m) return Number(m[0]); } catch (e) {}
        return null;
      }
      if (typeof val === 'string') {
        const m = val.match(/([-+]?[0-9]*\.?[0-9]+)/);
        if (m) return Number(m[0]);
        return null;
      }
      return null;
    };

    const lc2 = parsedOutput && parsedOutput.life_cycle_emissions ? parsedOutput.life_cycle_emissions : parsedOutput || {};
    const rm2_raw = lc2?.raw_material_extraction ?? parsedOutput?.raw_material_extraction ?? parsedOutput?.raw_material ?? null;
    const manu2_raw = lc2?.manufacturing ?? parsedOutput?.manufacturing ?? parsedOutput?.manufacturing_process ?? null;
    const trans2_raw = lc2?.transportation_distribution ?? parsedOutput?.transportation_distribution ?? parsedOutput?.transportation ?? null;
    const usep2_raw = lc2?.use_phase ?? parsedOutput?.use_phase ?? parsedOutput?.use ?? null;
    const eol2_raw = lc2?.end_of_life ?? parsedOutput?.end_of_life ?? parsedOutput?.end_of_life_stage ?? null;

    const rm2 = normalizeStageValue(rm2_raw);
    const manu2 = normalizeStageValue(manu2_raw);
    const trans2 = normalizeStageValue(trans2_raw);
    const usep2 = normalizeStageValue(usep2_raw);
    const eol2 = normalizeStageValue(eol2_raw);

    const total2 = [rm2, manu2, trans2, usep2, eol2].reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    const result2 = {
      time: new Date().toISOString(),
      product,
      model: mapping.model,
      raw_material_extraction: rm2,
      manufacturing: manu2,
      transportation_distribution: trans2,
      use_phase: usep2,
      end_of_life: eol2,
      total: Number.isFinite(total2) ? total2 : null,
      processing_time_ms: duration,
      ai_response: sanitizedRaw,
      ai_response_slim,
      ai_parsed: parsedOutput,
      ai_parsed_normalized: {
        raw_material_extraction: rm2,
        manufacturing: manu2,
        transportation_distribution: trans2,
        use_phase: usep2,
        end_of_life: eol2,
        total: Number.isFinite(total2) ? total2 : null
      }
    };
    // Build ChatGPT-like message wrapper for frontend compatibility
    try {
      const prettyText2 = parsedOutput ? (typeof parsedOutput === 'string' ? parsedOutput : JSON.stringify(parsedOutput, null, 2)) : (sanitizedRaw && sanitizedRaw.candidates && sanitizedRaw.candidates[0] && sanitizedRaw.candidates[0].content ? (sanitizedRaw.candidates[0].content.parts ? (sanitizedRaw.candidates[0].content.parts.map(p=>p.text||'').join('\n')) : (sanitizedRaw.candidates[0].content.text||'') ) : null);
      result2.chat = { messages: [ { role: 'assistant', content: { type: 'structured', structured: parsedOutput || null, text: prettyText2 } } ] };
    } catch (e) { /* ignore */ }
    await cleanupSavedFiles();
    return res.json(result2);
  } catch (err) {
    console.error(err);
    try { await cleanupSavedFiles(); } catch (e) { /* ignore cleanup errors */ }
    res.status(500).json({ error: 'server error' });
  }
});

// Endpoint to expose available products and model keys to the frontend.
// The frontend calls this to populate dropdowns automatically when `PROVIDER_MAP` changes.
app.get('/models', (_req, res) => {
  // Return an informative model list: keep the original key (used as the
  // option value sent back to the server) but also include the mapped
  // provider model id so the UI can show which real model will be used.
  const out = {};
  Object.keys(PROVIDER_MAP).forEach((product) => {
    const entries = [];
    const map = PROVIDER_MAP[product] || {};
    Object.keys(map).forEach((k) => {
      const m = map[k] || {};
      entries.push({ key: k, model: m.model || null, provider: m.provider || null });
    });
    out[product] = entries;
  });
  res.json(out);
});

// Debug: list Gemini models available to the configured API key
app.get('/gemini/models', async (_req, res) => {
  try {
    const google = require('./providers/google');
    const data = await google.listModels();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'gemini_list_failed', message: e && e.message });
  }
});

app.listen(PORT, () => console.log(`AI model test server running on http://localhost:${PORT}`));
