const fetch = require('node-fetch');
require('dotenv').config();

const key = process.env.CLAUDE_API_KEY;
if (!key) { console.error('CLAUDE_API_KEY not set in env'); process.exit(2); }

function generateCandidates(startY=2023,startM=1,endY=2026,endM=3){
  const res = [];
  let y = startY, m = startM;
  while (y < endY || (y === endY && m <= endM)){
    const mm = String(m).padStart(2,'0');
    res.push(`${y}-${mm}-01`);
    res.push(`${y}-${mm}-15`);
    m++;
    if (m>12){ m=1; y++; }
  }
  return res;
}

const candidates = generateCandidates(2023,1,2026,3);
(async ()=>{
  console.log('Probing', candidates.length, 'candidates');
  const successes = [];
  for (const v of candidates){
    try{
      const body = { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: [{ type: 'input_text', text: 'probe' }] }] };
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type':'application/json', 'x-api-key': key, 'anthropic-version': v }, body: JSON.stringify(body), timeout: 15000
      });
      const text = await resp.text();
      let ok=false; try{ const j=JSON.parse(text); if (!j.error) ok=true; }catch(e){ ok=false; }
      console.log(v, resp.status, ok ? 'OK' : 'ERR');
      if (ok) successes.push({version:v,status:resp.status,body:text.slice(0,1000)});
    }catch(e){ console.log(v, 'ERROR', e && e.message); }
  }
  console.log('--- Summary ---');
  if (successes.length) console.log('Successful versions:', successes);
  else console.log('No successful versions found in probe range.');
})();
