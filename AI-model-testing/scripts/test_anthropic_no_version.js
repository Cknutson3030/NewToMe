const fetch = require('node-fetch');
require('dotenv').config();
const key = process.env.CLAUDE_API_KEY;
(async ()=>{
  try{
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type':'application/json', 'x-api-key': key },
      body: JSON.stringify({ model: 'claude-haiku-4-5', messages: [{ role: 'user', content: [{ type: 'input_text', text: 'test' }] }] }), timeout: 15000
    });
    const text = await resp.text();
    console.log('status', resp.status);
    console.log('body', text.slice(0,2000));
  } catch (e) { console.error(e && e.message); }
})();
