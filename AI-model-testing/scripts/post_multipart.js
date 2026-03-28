const http = require('http');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'test-image.png');
const fileBuffer = fs.readFileSync(filePath);
const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);

function buildMultipart(fields, fileFieldName, filename, fileBuffer, fileMime) {
  const crlf = '\r\n';
  let parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}${crlf}`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"${crlf}${crlf}`));
    parts.push(Buffer.from(String(value) + crlf));
  }
  // file part
  parts.push(Buffer.from(`--${boundary}${crlf}`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="${fileFieldName}"; filename="${filename}"${crlf}`));
  parts.push(Buffer.from(`Content-Type: ${fileMime || 'application/octet-stream'}${crlf}${crlf}`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(crlf));

  parts.push(Buffer.from(`--${boundary}--${crlf}`));
  return Buffer.concat(parts);
}

const fields = { product: 'Claude', model: 'Low reasoning / vision baseline' };
const body = buildMultipart(fields, 'file', 'test-image.png', fileBuffer, 'image/png');

const target = process.argv[2] || process.env.TARGET_URL || 'http://localhost:3000/submit';
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
