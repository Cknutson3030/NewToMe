const fetch = require('node-fetch');
require('dotenv').config();
(async ()=>{
  const key = process.env.CLAUDE_API_KEY;
  if (!key) { console.error('CLAUDE_API_KEY not set'); process.exit(2); }
  try{
    const resp = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key } });
    const j = await resp.json();
    console.log('status', resp.status);
    console.log(JSON.stringify(j, null, 2).slice(0,4000));
  } catch(e){ console.error('err', e && e.message); }
})();
