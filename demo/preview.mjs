// 预览：把仓库根目录当静态站点（这样 demo 能直接读到 ../README.md），入口是 /demo/。
// 原生 ESM + importmap 不需要打包器，只要求不能走 file:// 协议。
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 4182;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/') {
    res.writeHead(302, { location: '/demo/' }).end();
    return;
  }
  let filePath = join(root, normalize(urlPath).replace(/^([/\\])+/, ''));
  // 目录请求回 index.html；仓库根之外的路径一律拒绝
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
    statSync(filePath);
  } catch {
    res.writeHead(404).end('Not Found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`mdi2esm ESM demo: http://localhost:${port}/demo/`);
});
