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
  let maxSubmissions = 20; // inclusive of initial one (editable by UI)
  let _autoScheduleId = null; // scheduled next submit
  let _inFlight = false; // track if submit is currently running
  let _countdownId = null;
  const countdownEl = document.getElementById('countdown');
  const autoWaitEl = document.getElementById('autoWait');
  // seconds to wait between auto submissions (user asked about 10s)
  let waitSeconds = 5;
  const maxSubmissionsEl = document.getElementById('maxSubmissions');
  const waitSecondsEl = document.getElementById('waitSeconds');
  const processedCountEl = document.getElementById('processedCount');
  // initialize from UI inputs if present
  try {
    if (maxSubmissionsEl) {
      const v = Number(maxSubmissionsEl.value || maxSubmissions);
      if (Number.isFinite(v) && v >= 1) maxSubmissions = Math.max(1, Math.floor(v));
      maxSubmissionsEl.addEventListener('change', () => {
        const nv = Number(maxSubmissionsEl.value);
        maxSubmissions = (Number.isFinite(nv) && nv >= 1) ? Math.max(1, Math.floor(nv)) : maxSubmissions;
      });
    }
    if (waitSecondsEl) {
      const w = Number(waitSecondsEl.value || waitSeconds);
      if (Number.isFinite(w) && w >= 1) waitSeconds = Math.max(1, Math.floor(w));
      waitSecondsEl.addEventListener('change', () => {
        const nw = Number(waitSecondsEl.value);
        waitSeconds = (Number.isFinite(nw) && nw >= 1) ? Math.max(1, Math.floor(nw)) : waitSeconds;
      });
    }
    if (processedCountEl) processedCountEl.textContent = String(submissionCount || 0);
  } catch (e) { /* ignore UI init errors */ }

  // Populate the `model` dropdown whenever the `product` selection changes.
  // Edit the `products` object above to control which keys are available in the UI.
  function setModels(){
    const p = productEl.value; // current product
    modelEl.innerHTML = '';
    // `products[p]` contains objects { key, model, provider }
    for(const entry of (products[p] || [])){
      const o = document.createElement('option');
      o.value = entry.key; // this value is sent to the backend and used to resolve mapping
      // show both the friendly key and the actual mapped model id for clarity
      o.textContent = entry.model ? `${entry.key} — ${entry.model}` : entry.key;
      modelEl.appendChild(o);
    }
  }

  // Handle files dragged into the drop area
  async function onDrop(e){
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
    await addFiles(files);
  }
  function onDragOver(e){ e.preventDefault(); }
  async function onFileChange(e){ const files = Array.from(e.target.files||[]).filter(f=>f.type.startsWith('image/')); await addFiles(files); }

  // Compress/resize images before adding to the local list and render thumbnails
  async function compressImage(file, maxDim = 800, quality = 0.7) {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const max = Math.max(width, height);
        if (max > maxDim) {
          const scale = maxDim / max;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return resolve(file); // fallback
          // Create a File so FormData sees a filename and type
          const newFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(newFile);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  // Add files to the local list and render thumbnails for quick visual verification
  async function addFiles(files){
    for(const f of files){
      try {
        const compressed = await compressImage(f, 800, 0.7);
        fileList.push(compressed);
        const img = document.createElement('img');
        img.src = URL.createObjectURL(compressed); // local blob preview
        thumbs.appendChild(img);
      } catch (e) {
        // fallback to original file
        fileList.push(f);
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        thumbs.appendChild(img);
      }
    }
  }

  // helper: extract numeric stage value from server body/parsing
  const getStageValue = (body, stage) => {
    const parsed = body.ai_parsed_normalized || body.ai_parsed || {};
    if (parsed && typeof parsed[stage] === 'number') return parsed[stage];
    if (body && typeof body[stage] === 'number') return body[stage];
    try {
      const nested = body && body.ai_parsed && body.ai_parsed.life_cycle_emissions && body.ai_parsed.life_cycle_emissions[stage];
      if (nested != null) {
        if (typeof nested === 'number') return nested;
        if (typeof nested === 'object') {
          if (typeof nested.kg_co2e === 'number') return nested.kg_co2e;
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

  // Append a result row to the history table
  const appendResult = (body, duration) => {
    try {
      const tr = document.createElement('tr');
      const rowNum = resultsBody.childElementCount + 1;
      const numTd = document.createElement('td'); numTd.textContent = rowNum.toString(); tr.appendChild(numTd);
      const timeTd = document.createElement('td'); timeTd.textContent = (body.time ? new Date(body.time).toLocaleString() : new Date().toLocaleString()); tr.appendChild(timeTd);
      const prodTd = document.createElement('td'); prodTd.textContent = body.product || productEl.value; tr.appendChild(prodTd);
      const modelTd = document.createElement('td'); modelTd.textContent = body.model || modelEl.value; tr.appendChild(modelTd);

      const fields = ['raw_material_extraction','manufacturing','transportation_distribution','use_phase','end_of_life'];
      for (const f of fields) {
        const td = document.createElement('td'); td.style.whiteSpace = 'pre-wrap';
        const v = getStageValue(body, f);
        td.textContent = (v == null ? '' : (typeof v === 'number' ? v : String(v)));
        tr.appendChild(td);
      }

      const parsed = body.ai_parsed_normalized || body.ai_parsed || {};
      const totalVal = (body && typeof body.total === 'number') ? body.total : (parsed && typeof parsed.total === 'number' ? parsed.total : null);
      const totalTd = document.createElement('td'); totalTd.style.textAlign = 'right'; totalTd.textContent = (totalVal == null ? '' : totalVal.toString()); tr.appendChild(totalTd);

      let inputTokensVal = null, outputTokensVal = null;
      try {
        const usage = (body && body.ai_response && body.ai_response.usage) ? body.ai_response.usage : (body && body.ai_response_slim && body.ai_response_slim.usage) ? body.ai_response_slim.usage : null;
        if (usage) {
          inputTokensVal = (usage.input_tokens != null ? usage.input_tokens : (usage.prompt_tokens != null ? usage.prompt_tokens : null));
          outputTokensVal = (usage.output_tokens != null ? usage.output_tokens : (usage.completion_tokens != null ? usage.completion_tokens : null));
        }
      } catch (e) { inputTokensVal = null; outputTokensVal = null; }
      const inputTd = document.createElement('td'); inputTd.style.textAlign = 'right'; inputTd.textContent = (inputTokensVal == null ? '' : String(inputTokensVal)); tr.appendChild(inputTd);
      const outputTd = document.createElement('td'); outputTd.style.textAlign = 'right'; outputTd.textContent = (outputTokensVal == null ? '' : String(outputTokensVal)); tr.appendChild(outputTd);

      const durTd = document.createElement('td'); durTd.style.textAlign = 'right'; durTd.textContent = duration.toString(); tr.appendChild(durTd);
      resultsBody.insertBefore(tr, resultsBody.firstChild);
    } catch (e) { console.warn('append history failed', e); }
  };

  // Post FormData and return parsed JSON and duration
  const postForm = async (form) => {
    const start = Date.now();
    try { if (processingEl) { processingEl.textContent = '0.0s'; _timerStart = Date.now(); _timerId = setInterval(() => { const s = (Date.now() - _timerStart)/1000; processingEl.textContent = s.toFixed(1) + 's'; }, 150); } } catch(e){}
    const res = await fetch('/submit', { method: 'POST', body: form });
    const body = await res.json();
    const duration = Date.now() - start;
    if (_timerId) { clearInterval(_timerId); _timerId = null; }
    if (processingEl) processingEl.textContent = (body.processing_time_ms || body.duration_ms || duration) + ' ms';
    return { body, duration };
  };

  // Submit the selected files and the chosen product/model to the backend.
  // If multiple images present, run sequential per-image submissions with concurrency=2.
  async function submit(){
    if(!fileList.length){ alert('add images first'); return; }
    if (_inFlight) { console.warn('submit skipped: already in-flight'); return; }
    _inFlight = true;

    // Always send all images in one request per user's preference
    const form = new FormData();
    for (const f of fileList) form.append('images', f);
    form.append('product', productEl.value);
    form.append('model', modelEl.value);

    try {
      const { body, duration } = await postForm(form);
      appendResult(body, duration);
    } catch (e) { console.error('submit failed', e); }
    
    // increment completed submission counter and schedule automation if enabled
    try {
      submissionCount += 1;
      try { if (processedCountEl) processedCountEl.textContent = String(submissionCount); } catch(e){}
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
    // reset automation counters and UI
    submissionCount = 0;
    automationActive = true;
    if (_autoScheduleId) { clearTimeout(_autoScheduleId); _autoScheduleId = null; }
    if (_countdownId) { clearInterval(_countdownId); _countdownId = null; }
    if (autoWaitEl) autoWaitEl.style.display = 'none';
    if (countdownEl) countdownEl.textContent = '--';
    try { const finish = document.getElementById('finishBadge'); if (finish) finish.style.display = 'none'; } catch(e){}
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
      // server now returns { ProductName: [{key,model,provider}, ...], ... }
      products = json;
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
