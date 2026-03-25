(async ()=> {
  try {
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
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k]) process.env[k] = v;
        });
      }
    } catch (e) { /* ignore env load errors */ }

    const provider = require('../providers/google');
    console.log('Using GEMINI_API_KEY from env:', !!process.env.GEMINI_API_KEY);
    const res = await provider.listModels();
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('Error listing models:', e && (e.message || e));
    process.exit(1);
  }
})();
