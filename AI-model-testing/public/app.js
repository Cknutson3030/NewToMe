window.app = (function(){
  const products = {
    ChatGPT: ['gpt-image-1','gpt-image-2','gpt-image-3'],
    Gemini: ['gemini-image-1','gemini-image-2','gemini-image-3'],
    Claude: ['claude-image-1','claude-image-2','claude-image-3'],
    Grok: ['grok-image-1','grok-image-2','grok-image-3']
  };
  const fileList = [];
  const productEl = document.getElementById('product');
  const modelEl = document.getElementById('model');
  const thumbs = document.getElementById('thumbs');
  const meta = document.getElementById('meta');
  const timeEl = document.getElementById('time');
  const respEl = document.getElementById('response');

  function setModels(){
    const p = productEl.value;
    modelEl.innerHTML = '';
    for(const m of products[p]){
      const o = document.createElement('option'); o.value = m; o.textContent = m; modelEl.appendChild(o);
    }
  }

  function onDrop(e){
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
    addFiles(files);
  }
  function onDragOver(e){ e.preventDefault(); }
  function onFileChange(e){ const files = Array.from(e.target.files||[]).filter(f=>f.type.startsWith('image/')); addFiles(files); }

  function addFiles(files){
    for(const f of files){ fileList.push(f); const img = document.createElement('img'); img.src = URL.createObjectURL(f); thumbs.appendChild(img); }
  }

  async function submit(){
    if(!fileList.length){ alert('add images first'); return; }
    const form = new FormData();
    for(const f of fileList) form.append('images', f);
    form.append('product', productEl.value);
    form.append('model', modelEl.value);

    respEl.textContent = 'sending...';
    const start = Date.now();
    const res = await fetch('/submit', { method: 'POST', body: form });
    const body = await res.json();
    const duration = Date.now() - start;
    meta.textContent = `${body.product || productEl.value} / ${body.model || modelEl.value}`;
    timeEl.textContent = body.duration_ms || duration;
    respEl.textContent = JSON.stringify(body.ai_response || body, null, 2);
  }

  productEl.addEventListener('change', setModels);
  setModels();

  return { onDrop, onDragOver, onFileChange, submit };
})();
