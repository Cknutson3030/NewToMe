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
    'gpt-5.4': { provider: 'openai', model: 'gpt-5.4' },
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

    // JSON Schema for structured output (kept consistent across experiments)
    const schemaObj = {
      name: 'image_analysis',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          objects: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                confidence: { type: 'number' },
                bbox: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' }
                  },
                  required: ['x', 'y', 'width', 'height']
                }
              },
              required: ['label', 'confidence', 'bbox']
            }
          },
          dominant_colors: { type: 'array', items: { type: 'string' } },
          detected_text: { type: 'string' },
          adult_content: { type: 'boolean' }
        },
        required: ['description', 'objects', 'dominant_colors', 'detected_text', 'adult_content']
      }
    };

    // Shared prompt template used for all providers and experiments.
    // Keep the template here so every experiment uses the exact same instruction text.
    // Use `{product}` and `{model}` placeholders which will be replaced at runtime.
    const PROMPT_TEMPLATE = `Product: {product}; Model: {model}. Analyze the images and return only JSON matching schema 'image_analysis'.`;

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
      // try to extract a parsed structured output when available
      let parsedOutput = null;
      try {
        if (body.output_parsed) {
          parsedOutput = body.output_parsed;
        } else if (Array.isArray(body.output)) {
          for (const item of body.output) {
            if (item.type === 'message' && Array.isArray(item.content)) {
              for (const c of item.content) {
                if (c.type === 'output_text' && typeof c.text === 'string') {
                  try { parsedOutput = JSON.parse(c.text); break; } catch (e) { /* not JSON */ }
                }
                if (c.type === 'structured_output') { parsedOutput = c; break; }
              }
            }
            if (parsedOutput) break;
          }
        }
      } catch (e) {
        console.warn('parse structured output failed', e && e.message);
      }

      await cleanupSavedFiles();
      return res.json({ product, model, urls: savedUrls, duration_ms: duration, ai_response: body, ai_parsed: parsedOutput });
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
    // attempt to extract parsed structured output
    let parsedOutput = null;
    try {
      if (body.output_parsed) {
        parsedOutput = body.output_parsed;
      } else if (Array.isArray(body.output)) {
        for (const item of body.output) {
          if (item.type === 'message' && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (c.type === 'output_text' && typeof c.text === 'string') {
                try { parsedOutput = JSON.parse(c.text); break; } catch (e) { /* not JSON */ }
              }
              if (c.type === 'structured_output') { parsedOutput = c; break; }
            }
          }
          if (parsedOutput) break;
        }
      }
    } catch (e) { console.warn('parse structured output failed', e && e.message); }

    await cleanupSavedFiles();
    return res.json({ product, model: mapping.model, urls: savedUrls, duration_ms: duration, ai_response: body, ai_parsed: parsedOutput });
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
