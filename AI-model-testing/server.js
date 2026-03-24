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
    const files = req.files || [];
    const { product, model } = req.body;
    if (!files.length) return res.status(400).json({ error: 'no images uploaded' });

    const savedUrls = [];
    for (const f of files) {
      const name = `${Date.now()}-${f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const outPath = path.join(uploadsDir, name);
      fs.writeFileSync(outPath, f.buffer);
      savedUrls.push(`${req.protocol}://${req.get('host')}/uploads/${name}`);
    }

    // JSON Schema for structured output
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

    const inputs = savedUrls.map((u) => ({ type: 'image', image_url: u }));
    inputs.push({ role: 'user', content: `Product: ${product}; Model: ${model}. Analyze images and return only JSON matching schema 'image_analysis'.` });

    // Resolve provider and model mapping
    const mapping = (PROVIDER_MAP[product] || {})[model];

    if (!mapping) {
      // fallback: treat provided `model` as an OpenAI model identifier
      if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
      const start = Date.now();
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: model || 'MODEL_NAME', input: inputs, response_format: { type: 'json_schema', json_schema: schemaObj } })
      });
      const body = await response.json();
      const duration = Date.now() - start;
      return res.json({ product, model, urls: savedUrls, duration_ms: duration, ai_response: body });
    }

    if (mapping.provider !== 'openai') {
      // Provider not implemented in this test harness — return mapping so caller can extend
      return res.status(501).json({ error: 'provider_not_implemented', provider: mapping.provider, mapping });
    }

    // For OpenAI provider, call the Responses API with the mapped model id
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
    const start = Date.now();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: mapping.model, input: inputs, response_format: { type: 'json_schema', json_schema: schemaObj } })
    });
    const body = await response.json();
    const duration = Date.now() - start;

    res.json({ product, model: mapping.model, urls: savedUrls, duration_ms: duration, ai_response: body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.listen(PORT, () => console.log(`AI model test server running on http://localhost:${PORT}`));
