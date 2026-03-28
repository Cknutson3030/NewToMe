// Quick simulation of server.js parsing for an Anthropic/Claude response
// Run with: node scripts/simulate_claude.js

const sampleBody = {
  ai_response: {
    content: [
      {
        type: 'text',
        text: '{"functional_unit": "One Jenga® Classic wooden block game set (54 wooden blocks and wooden frame/base unit)", "life_cycle_emissions": {"raw_material_extraction": {"kg_co2e": 0.85}, "manufacturing": {"kg_co2e": 1.24}, "transportation_distribution": {"kg_co2e": 0.42}, "use_phase": {"kg_co2e": 0.0}, "end_of_life": {"kg_co2e": 0.15}}}'
      }
    ],
    usage: { input_tokens: 100, output_tokens: 50 }
  },
  model: 'claude-opus-4-6'
};

// Helpers copied/adapted from server.js parsing logic (best-effort)
function extractJSONFromString(txt) {
  if (!txt || typeof txt !== 'string') return null;
  try { const v = JSON.parse(txt); if (v && typeof v === 'object') return v; } catch (e) {}
  for (let i = 0; i < txt.length; i++) {
    if (txt[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < txt.length; j++) {
      const ch = txt[j];
      if (ch === '{') depth++; else if (ch === '}') depth--;
      if (depth === 0) {
        const candidate = txt.slice(i, j + 1);
        try { const v = JSON.parse(candidate); if (v && typeof v === 'object') return v; } catch (e) {}
        break;
      }
    }
  }
  return null;
}

function tryUnwrapQuoted(txt) {
  if (!txt || typeof txt !== 'string') return null;
  let s = txt.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  const direct = extractJSONFromString(s);
  if (direct) return direct;
  return null;
}

function normalizeStageValue(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'object') {
    const candidates = ['kg_co2e','kg_co2e_value','value','amount'];
    for (const k of candidates) {
      if (k in val) {
        const v = val[k]; if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const m = v.match(/([-+]?[0-9]*\.?[0-9]+)/);
          if (m) return Number(m[0]);
        }
      }
    }
    try { const s = JSON.stringify(val); const m = s.match(/([-+]?[0-9]*\.?[0-9]+)/); if (m) return Number(m[0]); } catch (e) {}
    return null;
  }
  if (typeof val === 'string') {
    const m = val.match(/([-+]?[0-9]*\.?[0-9]+)/);
    if (m) return Number(m[0]);
    return null;
  }
  return null;
}

// Simulate server parsing flow
function parseAnthropicLike(body) {
  let parsedOutput = null;
  try {
    if (body.ai_response && Array.isArray(body.ai_response.content)) {
      for (const item of body.ai_response.content) {
        if (!item) continue;
        if (item.type === 'structured_output' && item.value) { parsedOutput = item.value; break; }
        if (item.type === 'text' && typeof item.text === 'string') {
          const v = tryUnwrapQuoted(item.text) || extractJSONFromString(item.text);
          if (v) { parsedOutput = v; break; }
        }
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (!c) continue;
            if (c.type === 'structured_output' && c.value) { parsedOutput = c.value; break; }
            if (c.type === 'text' && typeof c.text === 'string') {
              const v2 = tryUnwrapQuoted(c.text) || extractJSONFromString(c.text);
              if (v2) { parsedOutput = v2; break; }
            }
          }
          if (parsedOutput) break;
        }
      }
    }
  } catch (e) { /* ignore */ }

  // Normalize lifecycle stages
  const lc = (parsedOutput && parsedOutput.life_cycle_emissions) ? parsedOutput.life_cycle_emissions : parsedOutput || {};
  const rm = normalizeStageValue(lc.raw_material_extraction ?? parsedOutput?.raw_material_extraction ?? parsedOutput?.raw_material ?? null);
  const manu = normalizeStageValue(lc.manufacturing ?? parsedOutput?.manufacturing ?? parsedOutput?.manufacturing_process ?? null);
  const trans = normalizeStageValue(lc.transportation_distribution ?? parsedOutput?.transportation_distribution ?? parsedOutput?.transportation ?? null);
  const usep = normalizeStageValue(lc.use_phase ?? parsedOutput?.use_phase ?? parsedOutput?.use ?? null);
  const eol = normalizeStageValue(lc.end_of_life ?? parsedOutput?.end_of_life ?? parsedOutput?.end_of_life_stage ?? null);
  const total = [rm, manu, trans, usep, eol].reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);

  const result = {
    time: new Date().toISOString(),
    product: 'Claude',
    model: body.model || null,
    raw_material_extraction: rm,
    manufacturing: manu,
    transportation_distribution: trans,
    use_phase: usep,
    end_of_life: eol,
    total: Number.isFinite(total) ? total : null,
    processing_time_ms: 0,
    ai_response: body,
    ai_parsed: parsedOutput,
    ai_parsed_normalized: { raw_material_extraction: rm, manufacturing: manu, transportation_distribution: trans, use_phase: usep, end_of_life: eol, total: Number.isFinite(total) ? total : null }
  };
  return result;
}

const parsed = parseAnthropicLike(sampleBody);
console.log('Simulated parsed result:');
console.log(JSON.stringify(parsed, null, 2));
