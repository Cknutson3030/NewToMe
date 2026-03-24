window.app = (function(){
  // `products` will be fetched from the backend `/models` endpoint so the UI
  // reflects the authoritative `PROVIDER_MAP` in server.js automatically.
  // It will be populated on load.
  let products = {};
  const fileList = [];
  const productEl = document.getElementById('product');
  const modelEl = document.getElementById('model');
  const thumbs = document.getElementById('thumbs');
  // summary elements removed from UI; history table shows structured outputs
  
  const resultsBody = document.getElementById('resultsBody');
  const processingEl = document.getElementById('processingTimer');
  let _timerId = null;
  let _timerStart = null;
  // automation controls
  let automationActive = true; // allow automatic repeats by default
  let submissionCount = 0; // counts completed submissions (increment when result appended)
  const maxSubmissions = 30; // inclusive of initial one
  let _autoScheduleId = null; // scheduled next submit
  let _inFlight = false; // track if submit is currently running
  let _countdownId = null;
  const countdownEl = document.getElementById('countdown');
  const autoWaitEl = document.getElementById('autoWait');
  // seconds to wait between auto submissions (user asked about 10s)
  let waitSeconds = 5;

  // Populate the `model` dropdown whenever the `product` selection changes.
  // Edit the `products` object above to control which keys are available in the UI.
  function setModels(){
    const p = productEl.value; // current product
    modelEl.innerHTML = '';
    for(const m of products[p]){
      // create an option element for each model key
      const o = document.createElement('option');
      o.value = m; // this value is sent to the backend and used to resolve mapping
      o.textContent = m; // visible label in the dropdown
      modelEl.appendChild(o);
    }
  }

  // Handle files dragged into the drop area
  function onDrop(e){
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
    addFiles(files);
  }
  function onDragOver(e){ e.preventDefault(); }
  function onFileChange(e){ const files = Array.from(e.target.files||[]).filter(f=>f.type.startsWith('image/')); addFiles(files); }

  // Add files to the local list and render thumbnails for quick visual verification
  function addFiles(files){
    for(const f of files){
      fileList.push(f);
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f); // local blob preview
      thumbs.appendChild(img);
    }
  }

  // Submit the selected files and the chosen product/model to the backend.
  // The backend will resolve the mapping and call the provider; we then display results.
  async function submit(){
    if(!fileList.length){ alert('add images first'); return; }
    if (_inFlight) { console.warn('submit skipped: already in-flight'); return; }
    _inFlight = true;
    const form = new FormData();
    for(const f of fileList) form.append('images', f);
    // include our product/model keys so the backend can resolve which provider/model to call
    form.append('product', productEl.value);
    form.append('model', modelEl.value);

    const start = Date.now();
    // start live timer
    try { if (processingEl) { processingEl.textContent = '0.0s'; _timerStart = Date.now(); _timerId = setInterval(() => { const s = (Date.now() - _timerStart)/1000; processingEl.textContent = s.toFixed(1) + 's'; }, 150); } } catch(e){}
    const res = await fetch('/submit', { method: 'POST', body: form });
    const body = await res.json();
    const duration = Date.now() - start;
    // stop live timer
    if (_timerId) { clearInterval(_timerId); _timerId = null; }
    if (processingEl) processingEl.textContent = (body.processing_time_ms || body.duration_ms || duration) + ' ms';
    // prefer parsed structured output when available
    // prefer normalized parsed values when available
    const parsed = body.ai_parsed_normalized || body.ai_parsed || {};
    const procMs = body.processing_time_ms || body.duration_ms || duration;
    // helper to resolve numeric stage values from multiple possible shapes
    const getStageValue = (stage) => {
      // 1) prefer parsed normalized numeric values (ai_parsed_normalized)
      if (parsed && typeof parsed[stage] === 'number') return parsed[stage];
      // 2) top-level value from server response
      if (body && typeof body[stage] === 'number') return body[stage];
      // 3) ai_parsed may contain life_cycle_emissions nested object
      try {
        const nested = body && body.ai_parsed && body.ai_parsed.life_cycle_emissions && body.ai_parsed.life_cycle_emissions[stage];
        if (nested != null) {
          if (typeof nested === 'number') return nested;
          if (typeof nested === 'object') {
            if (typeof nested.kg_co2e === 'number') return nested.kg_co2e;
            // try to parse numeric string inside object
            for (const k of ['kg_co2e','value','amount']) {
              if (k in nested && typeof nested[k] === 'number') return nested[k];
              if (k in nested && typeof nested[k] === 'string') {
                const m = nested[k].match(/([-+]?[0-9]*\.?[0-9]+)/);
                if (m) return Number(m[0]);
              }
            }
          }
          if (typeof nested === 'string') {
            const m = nested.match(/([-+]?[0-9]*\.?[0-9]+)/);
            if (m) return Number(m[0]);
          }
        }
      } catch (e) { /* ignore */ }
      return null;
    };

    try {
      const tr = document.createElement('tr');
      // row number (1-based, increments per transaction)
      const rowNum = resultsBody.childElementCount + 1;
      const numTd = document.createElement('td'); numTd.textContent = rowNum.toString(); tr.appendChild(numTd);
      const timeTd = document.createElement('td'); timeTd.textContent = (body.time ? new Date(body.time).toLocaleString() : new Date().toLocaleString()); tr.appendChild(timeTd);
      const prodTd = document.createElement('td'); prodTd.textContent = body.product || productEl.value; tr.appendChild(prodTd);
      const modelTd = document.createElement('td'); modelTd.textContent = body.model || modelEl.value; tr.appendChild(modelTd);

      const fields = ['raw_material_extraction','manufacturing','transportation_distribution','use_phase','end_of_life'];
      for (const f of fields) {
        const td = document.createElement('td'); td.style.whiteSpace = 'pre-wrap';
        const v = getStageValue(f);
        td.textContent = (v == null ? '' : (typeof v === 'number' ? v : String(v)));
        tr.appendChild(td);
      }

      const totalVal = (body && typeof body.total === 'number') ? body.total : (parsed && typeof parsed.total === 'number' ? parsed.total : null);
      const totalTd = document.createElement('td'); totalTd.style.textAlign = 'right'; totalTd.textContent = (totalVal == null ? '' : totalVal.toString()); tr.appendChild(totalTd);

      // tokens: look for ai_response.usage.total_tokens
      let tokensVal = null;
      try { tokensVal = (body && body.ai_response && body.ai_response.usage && (body.ai_response.usage.total_tokens ?? body.ai_response.usage.total_tokens)) ?? null; } catch (e) { tokensVal = null; }
      const tokenTd = document.createElement('td'); tokenTd.style.textAlign = 'right'; tokenTd.textContent = (tokensVal == null ? '' : String(tokensVal)); tr.appendChild(tokenTd);

      const durTd = document.createElement('td'); durTd.style.textAlign = 'right'; durTd.textContent = procMs.toString(); tr.appendChild(durTd);
      resultsBody.insertBefore(tr, resultsBody.firstChild);
    } catch (e) { console.warn('append history failed', e); }

    // increment completed submission counter and schedule automation if enabled
    try {
      submissionCount += 1;
      // clear any previously scheduled auto call to avoid duplicates
      if (_autoScheduleId) { clearTimeout(_autoScheduleId); _autoScheduleId = null; }

      // If we've reached the max submissions, show Finish and stop automation
      if (submissionCount >= maxSubmissions) {
        automationActive = false;
        // clear any countdown and scheduled jobs
        if (_countdownId) { clearInterval(_countdownId); _countdownId = null; }
        if (_autoScheduleId) { clearTimeout(_autoScheduleId); _autoScheduleId = null; }
        if (autoWaitEl) autoWaitEl.style.display = 'none';
        if (countdownEl) countdownEl.textContent = '--';
        try { const finish = document.getElementById('finishBadge'); if (finish) finish.style.display = 'inline'; } catch(e){}
      } else if (automationActive) {
        // schedule next submit after waitSeconds seconds
        let remaining = waitSeconds * 1000;
        if (autoWaitEl) autoWaitEl.style.display = 'block';
        if (countdownEl) countdownEl.textContent = (remaining/1000).toFixed(1) + 's';
        // update countdown every 200ms
        if (_countdownId) { clearInterval(_countdownId); _countdownId = null; }
        _countdownId = setInterval(() => {
          remaining -= 200;
          if (remaining <= 0) {
            if (countdownEl) countdownEl.textContent = '0.0s';
            clearInterval(_countdownId); _countdownId = null;
          } else {
            if (countdownEl) countdownEl.textContent = (remaining/1000).toFixed(1) + 's';
          }
        }, 200);
        _autoScheduleId = setTimeout(() => {
          // hide countdown
          if (_countdownId) { clearInterval(_countdownId); _countdownId = null; }
          if (autoWaitEl) autoWaitEl.style.display = 'none';
          if (countdownEl) countdownEl.textContent = '--';
          // only auto-run if automation still active
          if (automationActive) {
            try { submit(); } catch (e) { console.warn('auto submit failed', e); }
          }
        }, waitSeconds * 1000);
      }
    } catch (e) { console.warn('scheduling auto failed', e); }

    // leave images in the box (user requested). Clean button will clear them.
    _inFlight = false;
  }

  // Remove previewed images and clear the file list (manual action)
  function clean(){
    // revoke object URLs if any
    try { thumbs.querySelectorAll('img').forEach(img => { try { URL.revokeObjectURL(img.src); } catch(e){} }); } catch(e){}
    fileList.length = 0;
    thumbs.innerHTML = '';
  }

  // Stop automatic repeats and cancel pending scheduled submits
  function stop(){
    automationActive = false;
    if (_autoScheduleId) { clearTimeout(_autoScheduleId); _autoScheduleId = null; }
    // update Stop button label to indicate stop applied
    try {
      const btn = document.getElementById('stop');
      if (btn) {
        btn.textContent = 'Stop apply';
        btn.style.opacity = '0.8';
      }
    } catch (e) { /* ignore */ }
  }

  // Populate models when product selection changes. Initially fetch model keys
  // from the server so the frontend stays in sync with server mappings.
  productEl.addEventListener('change', setModels);

  // Fetch available products + model keys from backend
  fetch('/models')
    .then((r) => r.json())
    .then((json) => {
      products = json; // { ProductName: [modelKey1, modelKey2, ...], ... }
      // populate product dropdown
      productEl.innerHTML = '';
      Object.keys(products).forEach((p) => {
        const o = document.createElement('option'); o.value = p; o.textContent = p; productEl.appendChild(o);
      });
      setModels();
    })
    .catch((err) => {
      console.error('failed to load models from server', err);
      // fallback: keep product dropdown as-is (if file had defaults)
      setModels();
    });

  return { onDrop, onDragOver, onFileChange, submit, clean, stop };
})();
