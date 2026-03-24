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
    'gpt-image-1': { provider: 'openai', model: 'gpt-image-1' },
    'gpt-image-2': { provider: 'openai', model: 'gpt-image-2' },
    'gpt-image-3': { provider: 'openai', model: 'gpt-image-3' }
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

app.post('/submit', upload.array('images', 6), async (req, res) => {
  try {
    // receive files and metadata
    const files = req.files || [];
    const { product, model } = req.body;
    if (!files.length) return res.status(400).json({ error: 'no images uploaded' });

    // save uploaded images to local uploads dir and build public URLs
    const savedUrls = [];
    for (const f of files) {
      const name = `${Date.now()}-${f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const outPath = path.join(uploadsDir, name);
      fs.writeFileSync(outPath, f.buffer);
      savedUrls.push(`${req.protocol}://${req.get('host')}/uploads/${name}`);
    }

    // JSON Schema for structured output (kept consistent across experiments)
    const schemaObj = {
      name: 'image_analysis',
      schema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          objects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                confidence: { type: 'number' },
                bbox: {
                  type: 'object',
                  properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } }
                }
              },
              required: ['label', 'confidence']
            }
          },
          dominant_colors: { type: 'array', items: { type: 'string' } },
          detected_text: { type: 'string' },
          adult_content: { type: 'boolean' }
        }
      }
    };

    // Shared prompt template used for all providers and experiments.
    // Keep the template here so every experiment uses the exact same instruction text.
    // Use `{product}` and `{model}` placeholders which will be replaced at runtime.
    const PROMPT_TEMPLATE = `Product: {product}; Model: {model}. Analyze the images and return only JSON matching schema 'image_analysis'.`;

    // Resolve provider and model mapping based on frontend selections
    const mapping = (PROVIDER_MAP[product] || {})[model];

    // Build inputs: image items first, then the user prompt (using resolved model identifier)
    const inputs = savedUrls.map((u) => ({ type: 'image', image_url: u }));
    const resolvedModelForPrompt = mapping?.model || model;
    const finalPrompt = PROMPT_TEMPLATE.replace('{product}', product).replace('{model}', resolvedModelForPrompt);
    inputs.push({ role: 'user', content: finalPrompt });

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
        body: JSON.stringify({ model: model || 'MODEL_NAME', input: inputs, response_format: { type: 'json_schema', json_schema: schemaObj } })
      });
      const body = await response.json();
      const duration = Date.now() - startTime;
      return res.json({ product, model, urls: savedUrls, duration_ms: duration, ai_response: body });
    }

    // Non-OpenAI providers are not implemented in this harness yet
    if (mapping.provider !== 'openai') {
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
      body: JSON.stringify({ model: mapping.model, input: inputs, response_format: { type: 'json_schema', json_schema: schemaObj } })
    });
    const body = await response.json();
    const duration = Date.now() - startTime;

    return res.json({ product, model: mapping.model, urls: savedUrls, duration_ms: duration, ai_response: body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.listen(PORT, () => console.log(`AI model test server running on http://localhost:${PORT}`));
