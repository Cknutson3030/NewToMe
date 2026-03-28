const http = require('http');
const querystring = require('querystring');

// Known-good PNG URL (change if needed)
const imageUrl = process.argv[2] || process.env.IMAGE_URL || 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';
const product = process.argv[3] || process.env.PRODUCT || 'Claude';
const model = process.argv[4] || process.env.MODEL || 'Low reasoning / vision baseline';

const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
const crlf = '\r\n';
let parts = [];

function pushField(name, value) {
  parts.push(Buffer.from(`--${boundary}${crlf}`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"${crlf}${crlf}`));
  parts.push(Buffer.from(String(value) + crlf));
}

pushField('product', product);
pushField('model', model);
pushField('image_url', imageUrl);
parts.push(Buffer.from(`--${boundary}--${crlf}`));
const body = Buffer.concat(parts);

const target = process.argv[5] || process.env.TARGET_URL || 'http://localhost:3021/submit';
const u = new URL(target);
const options = {
  hostname: u.hostname,
  port: u.port || (u.protocol === 'https:' ? 443 : 80),
  path: u.pathname + (u.search || ''),
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': body.length
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('HEADERS', res.headers);
    console.log('BODY', data);
  });
});
req.on('error', (e) => { console.error('Request error', e); });
req.write(body);
req.end();
