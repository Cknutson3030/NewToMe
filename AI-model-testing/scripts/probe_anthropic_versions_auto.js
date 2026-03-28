const fetch = require('node-fetch');
require('dotenv').config();

const key = process.env.CLAUDE_API_KEY;
if (!key) { console.error('CLAUDE_API_KEY not set in env'); process.exit(2); }

const listEnv = process.env.ANTHROPIC_API_VERSIONS || process.env.ANTHROPIC_API_VERSION || '';
const defaults = ['2025-03-01','2024-12-05','2024-11-30','2024-10-15','2024-08-01','2023-01-01'];
const candidates = listEnv ? listEnv.split(',').map(s=>s.trim()).filter(Boolean) : defaults;

(async ()=>{
  console.log('Probing Anthropic /v1/messages with', candidates.length, 'candidates');
  for (const v of candidates) {
    try {
      const body = {
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: [{ type: 'input_text', text: 'Ping: is this version supported? Respond with short JSON {"ok":true}' }] }]
      };
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': v
        },
        body: JSON.stringify(body),
        timeout: 15000
      });
      const text = await resp.text();
      let ok = false;
      try { const j = JSON.parse(text); if (!j || (j && j.error && typeof j.error.message === 'string' && j.error.message.toLowerCase().includes('anthropic-version'))) ok = false; else ok = true; } catch(e){ ok = false; }
      console.log('---');
      console.log('version:', v, 'status:', resp.status, 'ok:', ok);
      console.log('response snippet:', (text||'').slice(0,800).replace(/\n/g,' '));
    } catch (e) {
      console.log('---');
      console.log('version:', v, 'error:', e && e.message);
    }
  }
})();
