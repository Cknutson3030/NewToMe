window.app = (function(){
  // `products` will be fetched from the backend `/models` endpoint so the UI
  // reflects the authoritative `PROVIDER_MAP` in server.js automatically.
  // It will be populated on load.
  let products = {};
  const fileList = [];
  const productEl = document.getElementById('product');
  const modelEl = document.getElementById('model');
  const thumbs = document.getElementById('thumbs');
  const meta = document.getElementById('meta');
  const timeEl = document.getElementById('time');
  // `response` element removed from UI; keep processing metadata and history table
  const resultsBody = document.getElementById('resultsBody');

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
    const form = new FormData();
    for(const f of fileList) form.append('images', f);
    // include our product/model keys so the backend can resolve which provider/model to call
    form.append('product', productEl.value);
    form.append('model', modelEl.value);

    const start = Date.now();
    const res = await fetch('/submit', { method: 'POST', body: form });
    const body = await res.json();
    const duration = Date.now() - start;
    // Display metadata and results; backend may return measured duration_ms
    meta.textContent = `${body.product || productEl.value} / ${body.model || modelEl.value}`;
    timeEl.textContent = body.duration_ms || duration;
    // prefer parsed structured output when available (kept for history)
    const parsed = body.ai_parsed || null;
    let responseText = '';
    if (parsed) responseText = JSON.stringify(parsed, null, 2);
    else if (body.ai_response) responseText = JSON.stringify(body.ai_response, null, 2);
    else responseText = JSON.stringify(body, null, 2);

    // append to history table
    try {
      const tr = document.createElement('tr');
      const timeTd = document.createElement('td'); timeTd.textContent = new Date().toLocaleString(); tr.appendChild(timeTd);
      const prodTd = document.createElement('td'); prodTd.textContent = body.product || productEl.value; tr.appendChild(prodTd);
      const modelTd = document.createElement('td'); modelTd.textContent = body.model || modelEl.value; tr.appendChild(modelTd);
      const respTd = document.createElement('td'); respTd.style.fontFamily = 'monospace'; respTd.style.whiteSpace = 'pre-wrap'; respTd.textContent = (parsed ? JSON.stringify(parsed) : (body.ai_response ? JSON.stringify(body.ai_response) : JSON.stringify(body))).slice(0, 200);
      tr.appendChild(respTd);
      const durTd = document.createElement('td'); durTd.textContent = (body.duration_ms || duration).toString(); tr.appendChild(durTd);
      resultsBody.insertBefore(tr, resultsBody.firstChild);
    } catch (e) { console.warn('append history failed', e); }

    // clear local file list and previews
    fileList.length = 0; thumbs.innerHTML = '';
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

  return { onDrop, onDragOver, onFileChange, submit };
})();
