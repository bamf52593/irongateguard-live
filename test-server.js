import http from 'http';

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/events/ingest') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      console.log('Received event:', JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(404, () => {
  console.log('Test server listening on port 404');
});