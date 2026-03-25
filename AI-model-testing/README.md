# AI Model Testing

Self-contained minimal test app for image-analysis comparisons between AI products.

Run locally:

1. Install dependencies: `npm install` inside this folder.
2. Set environment variable `OPENAI_API_KEY` to your key.
3. Start server: `node server.js` (or `npm start` if using package.json script).
4. Open `http://localhost:3000` in your browser.

Features:
- Choose AI product and model from dropdowns.
- Drag & drop images into the block, or pick files.
- Hit Submit to upload images to the local server, which proxies them to the OpenAI Responses API using Structured Outputs JSON Schema.
- Results show the selected product/model, the AI response JSON, and processing time.

Files in this folder implement a complete minimal flow for low-latency testing without modifying other parts of your repo.

Quick experiment example — swap a model
1. Edit the backend mapping in `AI-model-testing/server.js` and change the mapped model id. For example:

```js
// before
 'gpt-image-1': { provider: 'openai', model: 'gpt-image-1' }

// change to run experiment with new model id
 'gpt-image-1': { provider: 'openai', model: 'gpt-image-1-experiment' }
```

2. (Optional) If you added a new frontend key, update `AI-model-testing/public/app.js` `products` object to include it.

3. Restart the server and run the test flow in the browser.

```
npm install
npm start
open http://localhost:3000
```

This will route the same dropdown selection to the new model id for comparison runs.
