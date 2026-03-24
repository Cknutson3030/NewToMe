const fetch = require('node-fetch');

module.exports = async function fetchWithRetry(url, opts = {}) {
  const maxRetries = 3;
  const baseDelay = 800; // ms
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs || 60000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const merged = Object.assign({}, opts, { signal: controller.signal });
      const resp = await fetch(url, merged);
      clearTimeout(timeout);
      return resp;
    } catch (err) {
      clearTimeout(timeout);
      const isLast = attempt + 1 >= maxRetries;
      const shouldRetry = err && (err.type === 'system' || err.name === 'AbortError' || err.code === 'ECONNRESET');
      console.warn(`fetchWithRetry attempt ${attempt + 1} failed`, err && (err.message || err.code));
      if (!shouldRetry || isLast) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
    }
  }
};
