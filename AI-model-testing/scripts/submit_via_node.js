// Usage:
//  node scripts/submit_via_node.js --url https://example.com/image.jpg
//  node scripts/submit_via_node.js --file ./test.jpg

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

function usage() {
  console.log('Usage: node scripts/submit_via_node.js --url <image_url> | --file <path_to_image> [--product Claude] [--model "Reasoning-focused"]');
}

const argv = require('minimist')(process.argv.slice(2));
const product = argv.product || 'Claude';
const model = argv.model || 'Reasoning-focused';
const imageUrl = argv.url || argv.image_urls || argv.imageUrl || null;
const filePath = argv.file || argv.images || null;

if (!imageUrl && !filePath) {
  usage();
  process.exit(1);
}

async function main() {
  const form = new FormData();
  form.append('product', product);
  form.append('model', model);

  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.error('file not found:', filePath);
      process.exit(2);
    }
    form.append('images', fs.createReadStream(filePath));
  } else {
    form.append('image_urls', imageUrl);
  }

  try {
    const res = await fetch('http://localhost:3000/submit', { method: 'POST', body: form, headers: form.getHeaders(), timeout: 120000 });
    const text = await res.text();
    try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch (e) { console.log(text); }
  } catch (e) {
    console.error('submit failed', e && (e.message || e));
    process.exit(3);
  }
}

main();
