(async ()=> {
  try {
    // Load .env from project if present to pick up GEMINI_API_KEY for local tests
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '.env');
    try {
      if (fs.existsSync(envPath)) {
        const envText = fs.readFileSync(envPath, 'utf8');
        envText.split(/\r?\n/).forEach(line => {
          const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
          if (!m) return;
          const k = m[1];
          let v = m[2] || '';
          // Remove surrounding quotes if present
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k]) process.env[k] = v;
        });
      }
    } catch (e) { /* ignore env load errors */ }

    const provider = require('../providers/google');
    const { callProvider, parseResponse } = provider;

    const mapping = { model: process.env.TEST_MODEL || process.env.GEMINI_MODEL || 'gemini-3-flash-preview' };
    const requestItems = [
      'Extract the name and age from the following text: "John Doe is 28 years old."'
    ];

    const schemaObj = {
      name: 'person',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Person full name' },
          age: { type: 'integer', description: 'Person age in years' }
        },
        required: ['name','age']
      }
    };

    console.log('Using model:', mapping.model);
    const result = await callProvider(mapping, requestItems, schemaObj);

    console.log('\n--- callProvider result ---');
    console.log('duration_ms:', result.duration);
    console.log('ai_response_slim:', JSON.stringify(result.ai_response_slim, null, 2));

    console.log('\n--- Raw body (trimmed) ---');
    try { console.log(JSON.stringify(result.body).slice(0, 2000)); } catch (e) { console.log(String(result.body).slice(0,2000)); }

    console.log('\n--- parseResponse output ---');
    const parsed = await parseResponse(result.body);
    console.log(JSON.stringify(parsed, null, 2));

    console.log('\nSmoke test finished.');
  } catch (e) {
    console.error('Smoke test error:', e && (e.message || e), e && e.stack);
    process.exit(1);
  }
})();
