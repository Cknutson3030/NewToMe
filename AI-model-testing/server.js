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

// Map frontend product/model strings to provider + real model identifier
// NOTE: To test a different model in future experiments, edit the mapped `model` values below.
// Examples:
//  - To swap ChatGPT model for experiment: change the right-hand `model` for 'gpt-image-1' to another model id.
//  - To add a new model option: add a new key here and add the same key to the frontend `products` list in public/app.js.
const PROVIDER_MAP = {
  ChatGPT: {
    'gpt-5-nano': { provider: 'openai', model: 'gpt-5-nano' },
    'gpt-5.2': { provider: 'openai', model: 'gpt-5.2' },
    'gpt-5.1': { provider: 'openai', model: 'gpt-5.1' }
  },
  Gemini: {
    'gemini-image-1': { provider: 'google', model: 'gemini.vision.v1' },
    'gemini-image-2': { provider: 'google', model: 'gemini.vision.v1' },
    'gemini-image-3': { provider: 'google', model: 'gemini.vision.v1' }
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
                  assumptions: { type: 'string' },
                  coefficent: { type: 'string' }
                },
                required: ['kg_co2e', 'assumptions', 'coefficent']
              },
              manufacturing: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                  assumptions: { type: 'string' },
                  coefficent: { type: 'string' }
                },
                required: ['kg_co2e', 'assumptions', 'coefficent']
              },
              transportation_distribution: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                  assumptions: { type: 'string' },
                  coefficent: { type: 'string' }
                },
                required: ['kg_co2e', 'assumptions', 'coefficent']
              },
              use_phase: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                  assumptions: { type: 'string' },
                  coefficent: { type: 'string' }
                },
                required: ['kg_co2e', 'assumptions', 'coefficent']
              },
              end_of_life: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kg_co2e: { type: 'number' },
                  assumptions: { type: 'string' },
                  coefficent: { type: 'string' }
                },
                required: ['kg_co2e', 'assumptions', 'coefficent']
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
    d. Use phase (if applicable; otherwise explain why excluded)  
    e. End-of-life

  3. Output the results in a structured JSON object conforming to the provided schema.

  4. For each stage, include:
    - Estimated emissions (kg CO₂e)
    - Key assumptions
    - Coefficient: SHOW THE NUMBER YOU FOUND FROM DATA SOURCES
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

    // If mapping not found, fallback to treating `model` as an OpenAI model id
    if (!mapping) {
      if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
      const startTime = Date.now();
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        // Use the newer Responses API parameter location for structured output.
        // Older clients used `response_format`; newer API moves this under `text.format`.
        body: JSON.stringify({
          model: model || 'MODEL_NAME',
          input: requestItems,
          // primary: the new parameter location for Structured Outputs
          text: {
            format: {
              type: 'json_schema',
              name: schemaObj.name || 'image_analysis',
              strict: !!schemaObj.strict,
              schema: schemaObj.schema
            }
          }
        })
      });
      const body = await response.json();
      const duration = Date.now() - startTime;
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
        let parsedOutput = parseStructuredOutput(body);
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
        ai_response: body,
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
      await cleanupSavedFiles();
      return res.json(result);
    }

    // Non-OpenAI providers are not implemented in this harness yet
    if (mapping.provider !== 'openai') {
      await cleanupSavedFiles();
      return res.status(501).json({ error: 'provider_not_implemented', provider: mapping.provider, mapping });
    }

    // OpenAI provider: call Responses API with mapped model id
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
    const startTime = Date.now();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: mapping.model,
        input: requestItems,
        // newer API location for Structured Outputs
        text: {
          format: {
            type: 'json_schema',
            name: schemaObj.name || 'image_analysis',
            strict: !!schemaObj.strict,
            schema: schemaObj.schema
          }
        }
      })
    });
    const body = await response.json();
    const duration = Date.now() - startTime;
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
    let parsedOutput = parseStructuredOutput(body);
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
      ai_response: body,
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
  const out = {};
  Object.keys(PROVIDER_MAP).forEach((product) => {
    out[product] = Object.keys(PROVIDER_MAP[product]);
  });
  res.json(out);
});

app.listen(PORT, () => console.log(`AI model test server running on http://localhost:${PORT}`));
