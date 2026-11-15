// 把 src/ 同步进两个前端的 lib/markdown-rt（浏览器经 importmap 引用）。
// 与 shiki/katex 等 npm2esm 产物一样，lib 副本是构建输出。
// 浏览器用 importmap 解析裸 'markdown-rt'；node（测试）无法解析裸 specifier，
// 故在 esm / mdoc 各自的 node_modules 下生成 markdown-rt 软包指向 lib 副本，
// 让宿主壳的 `import ... from 'markdown-rt'` 在浏览器与 node 下都能解析到同一份 lib。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..'); // frontend
const src = path.resolve(here, '..', 'src');
const targets = [
  path.join(root, 'esm', 'lib', 'markdown-rt'),
  path.join(root, 'packages', 'mdoc', 'templates', '_site', 'lib', 'markdown-rt'),
];

for (const t of targets) {
  fs.rmSync(t, { recursive: true, force: true });
  fs.cpSync(src, t, { recursive: true });
  // lib 副本是 ESM；node（测试）按目录导入需 package.json 指明入口（浏览器靠 importmap 显式指向 index.js，无此要求）
  fs.writeFileSync(
    path.join(t, 'package.json'),
    `${JSON.stringify({ name: 'markdown-rt-lib', version: '0.0.0', type: 'module', main: 'index.js', exports: './index.js', private: true }, null, 2)}\n`,
  );
  console.log('synced ->', path.relative(root, t));
}

// node 软包：裸 'markdown-rt' 在 node 测试下的解析入口（main 指向对应 lib/index.js）
const shims = [
  {
    dir: path.join(root, 'esm', 'node_modules', 'markdown-rt'),
    main: '../../lib/markdown-rt/index.js',
  },
  {
    dir: path.join(root, 'packages', 'mdoc', 'node_modules', 'markdown-rt'),
    main: '../../templates/_site/lib/markdown-rt/index.js',
  },
];

for (const { dir, main } of shims) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: 'markdown-rt', version: '0.0.0', type: 'module', main }, null, 2)}\n`,
  );
  console.log('shim   ->', path.relative(root, dir), '(', main, ')');
}
