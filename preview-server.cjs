const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = __dirname;
const publicFiles = new Set(['index.html', 'library.html', 'styles.css', 'app.js', 'library.js', 'storage.js']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1:8000').pathname;
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!publicFiles.has(file)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const body = await fs.readFile(path.join(root, file));
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(file)],
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(new Date().toISOString(), error);
    response.writeHead(500);
    response.end('Could not load this file');
  }
});

server.on('error', (error) => {
  console.error(new Date().toISOString(), error);
  process.exitCode = 1;
});
server.listen(8000, '127.0.0.1', () => {
  console.log(`${new Date().toISOString()} Preview running at http://127.0.0.1:8000/ (PID ${process.pid})`);
});
