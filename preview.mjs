import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, {'Allow':'GET, HEAD'}); res.end(); return;
  }
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name !== '/vrchat' && !name.startsWith('/vrchat/')) throw new Error('Outside VRChat');
    if (name.includes('\\') || name.split('/').some(part => part.startsWith('.'))) throw new Error('Invalid path');
    const relative = name === '/vrchat' || name === '/vrchat/' ? 'index.html' : name.slice('/vrchat/'.length);
    const path = resolve(root, relative);
    if (!path.startsWith(resolve(root) + sep) || !(await stat(path)).isFile()) throw new Error('Not a file');
    const bytes = await readFile(path);
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end(req.method === 'HEAD' ? undefined : 'Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}/vrchat`));
