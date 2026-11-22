// 浏览器端 <<< / @include 展开：fetch 用虚拟文件树 mock，覆盖官方语法与路径规则。
// 移植自 mdoc 的 tests/source-expander.test.js，改为直接测库的 src/source-expander.js。
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { clearSourceCache, expandSource } from '../src/source-expander.js';

const FILES = new Map([
  ['/snippets/demo.js', 'const a = 1;\nconst b = 2;\n'],
  [
    '/snippets/regions.js',
    '// #region snippet\n    const inside = 1;\n    // #endregion snippet\nconst outside = 2;\n',
  ],
  ['/snippets/title.js', 'export const x = 1;\n'],
  ['/guide/snippets/relative.js', 'const relative = 1;\n'],
  ['/guide/parts/basics.md', '---\ntitle: T\n---\n## 小节\n\n[链接](./next.md)\n'],
  ['/guide/parts/ranged.md', 'line1\nline2\nline3\nline4\n'],
  ['/guide/parts/regions.md', '<!-- #region block -->\n区块内容\n<!-- #endregion block -->\n尾部\n'],
  ['/guide/parts/headings.md', '# 标题\n\n## 第一节\n\n一\n\n## 第二节\n\n二\n'],
  ['/guide/parts/nested.md', '## 嵌套\n\n<!-- @include: ./basics.md -->\n'],
  ['/guide/parts/cycle-a.md', 'A\n<!-- @include: ./cycle-b.md -->\n'],
  ['/guide/parts/cycle-b.md', 'B\n<!-- @include: ./cycle-a.md -->\n'],
]);

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

before(() => {
  globalThis.fetch = async (url) => {
    const key = String(url);
    if (!FILES.has(key)) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => FILES.get(key) };
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

test('<<< @/ 生成围栏代码块，默认标题取文件名', async () => {
  const out = await expandSource('<<< @/snippets/demo.js', 'guide/page.md');
  assert.equal(out, '```js [demo.js]\nconst a = 1;\nconst b = 2;\n\n```');
});

test('<<< 的行高亮、语言覆盖与自定义标题', async () => {
  const out = await expandSource(
    '<<< @/snippets/title.js{2} [Custom Title]\n<<< @/snippets/demo.js{1,2 ts:line-numbers}',
    'guide/page.md',
  );
  assert.match(out, /```js \{2\} \[Custom Title\]\nexport const x = 1;/);
  assert.match(out, /```ts:line-numbers \{1,2\} \[demo\.js\]\nconst a = 1;/);
});

test('<<< 的 region 提取、marker 剥离与 dedent', async () => {
  const out = await expandSource('<<< @/snippets/regions.js#snippet', 'guide/page.md');
  assert.equal(out, '```js [regions.js]\nconst inside = 1;\n```');
});

test('<<< 相对路径按当前文件的物理目录解析', async () => {
  const out = await expandSource('<<< ./snippets/relative.js', 'guide/page.md');
  assert.match(out, /```js \[relative\.js\]\nconst relative = 1;/);
});

test('base 部署前缀参与 fetch URL', async () => {
  const seen = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return prevFetch(url);
  };
  await expandSource('<<< @/snippets/demo.js', 'guide/page.md', { base: '/docs/' });
  globalThis.fetch = prevFetch;
  assert.ok(seen.includes('/docs/snippets/demo.js'));
});

test('围栏内的 <<< 保持原样（只当语法示例）', async () => {
  const src = '```md\n<<< @/snippets/demo.js\n```';
  assert.equal(await expandSource(src, 'guide/page.md'), src);
});

test('文件不存在时保留原指令并告警', async () => {
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  const directive = '<<< @/snippets/missing.js';
  assert.equal(await expandSource(directive, 'guide/page.md'), directive);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /保留原指令/);
  console.warn = originalWarn;
});

test('@include 剥离 frontmatter 并用 marker 包裹以便 rebase', async () => {
  const out = await expandSource('<!-- @include: ./parts/basics.md -->', 'guide/page.md');
  assert.match(out, /^<!-- @include-start: guide\/parts\/ -->\n\n## 小节/);
  assert.equal(out.includes('title: T'), false);
  assert.match(out, /<!-- @include-end -->$/);
});

test('@include 支持行数范围与 region', async () => {
  const ranged = await expandSource('<!-- @include: ./parts/ranged.md{2,3} -->', 'guide/page.md');
  assert.match(ranged, /line2\nline3/);
  assert.equal(ranged.includes('line1'), false);
  assert.equal(ranged.includes('line4'), false);
  const region = await expandSource('<!-- @include: ./parts/regions.md#block -->', 'guide/page.md');
  assert.match(region, /区块内容/);
  assert.equal(region.includes('尾部'), false);
});

test('@include 的 region 未命中时按标题锚点截取章节', async () => {
  const out = await expandSource('<!-- @include: ./parts/headings.md#第一节 -->', 'guide/page.md');
  assert.match(out, /^<!-- @include-start: guide\/parts\/ -->\n\n\n一\n/);
  assert.equal(out.includes('第二节'), false);
});

test('adapters.fetcher / resolveResource 接管 fetch 与 URL 拼装', async () => {
  const urls = [];
  const fetcher = async (url) => {
    urls.push(String(url));
    return originalFetch(url);
  };
  const resolveResource = ({ file }) => `/virtual/${file}`;
  await expandSource('<<< @/snippets/demo.js', 'guide/page.md', {
    adapters: { fetcher, resolveResource },
  });
  assert.deepEqual(urls, ['/virtual/snippets/demo.js']);
});

test('空 base 使用站点根绝对 URL，不发相对 fetch', async () => {
  clearSourceCache();
  const urls = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return prevFetch(url);
  };
  await expandSource('<<< @/snippets/demo.js', 'guide/page.md', { base: '' });
  globalThis.fetch = prevFetch;
  assert.deepEqual(urls, ['/snippets/demo.js']);
});

test('加载失败清缓存可重试，并触发 onResolveError', async () => {
  clearSourceCache();
  let attempts = 0;
  const errors = [];
  const fetcher = async () => {
    attempts += 1;
    if (attempts === 1) return { ok: false, status: 503, text: async () => '' };
    return { ok: true, status: 200, text: async () => 'const ok = true;' };
  };
  const options = { adapters: { fetcher }, onResolveError: (message) => errors.push(message) };
  const directive = '<<< @/snippets/flaky.js';
  assert.equal(await expandSource(directive, 'guide/page.md', options), directive);
  assert.match(await expandSource(directive, 'guide/page.md', options), /const ok = true;/);
  assert.equal(attempts, 2);
  assert.equal(errors.length, 1);
  clearSourceCache();
});

test('@include 递归展开，祖先链上的循环保留原指令', async () => {
  const nested = await expandSource('<!-- @include: ./parts/nested.md -->', 'guide/page.md');
  assert.match(nested, /## 嵌套/);
  assert.match(nested, /## 小节/);
  const cycle = await expandSource('<!-- @include: ./parts/cycle-a.md -->', 'guide/page.md');
  assert.match(cycle, /\nA\n/);
  assert.match(cycle, /\nB\n/);
  assert.match(cycle, /<!-- @include: \.\/cycle-a\.md -->/);
  // 循环链上只留下一条未展开指令，没有无限递归
  assert.equal((cycle.match(/<!-- @include:/g) ?? []).length, 1);
});
