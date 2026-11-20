import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createConfig, renderMarkdown } from '../src/index.js';

const navOf = (html) => /<nav class="table-of-contents">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
const renderedNavs = (html) =>
  [...html.matchAll(/<nav class="table-of-contents">([\s\S]*?)<\/nav>/g)].filter((m) => m[1].includes('<ul>')).length;

test('toc：默认层级 [2,3]，h4 不进目录', async () => {
  const { html } = await renderMarkdown('[[toc]]\n\n## A\n\n### B\n\n#### C');
  const nav = navOf(html);
  assert.ok(nav.includes('#a'));
  assert.ok(nav.includes('#b'));
  assert.ok(!nav.includes('#c'));
});

test('toc：showAutoNumber 标题与目录同步编号', async () => {
  const config = createConfig({ markdown: { toc: { showAutoNumber: true } } });
  const { html } = await renderMarkdown('[[toc]]\n\n## A\n\n### B\n\n## C', { config });
  assert.match(html, /<h2 id="a"><span class="toc-number" aria-hidden="true">1<\/span> A/);
  assert.match(html, /<h3 id="b"><span class="toc-number" aria-hidden="true">1.1<\/span> B/);
  assert.match(html, /<h2 id="c"><span class="toc-number" aria-hidden="true">2<\/span> C/);
  assert.match(html, /<a href="#a"><span class="toc-number" aria-hidden="true">1<\/span> A<\/a>/);
  // 编号不进 slug 与 headings
  assert.ok(html.includes('id="a"'));
});

test('toc：level 可配', async () => {
  const config = createConfig({ markdown: { toc: { level: [2] } } });
  const { html } = await renderMarkdown('[[toc]]\n\n## A\n\n### B', { config });
  const nav = navOf(html);
  assert.ok(nav.includes('#a'));
  assert.ok(!nav.includes('#b'));
});

test('toc：level 区间语义（[2,6] 含中间层级）', async () => {
  const config = createConfig({ markdown: { toc: { level: [2, 6] } } });
  const { html } = await renderMarkdown('[[toc]]\n\n## A\n\n### B\n\n#### C', { config });
  const nav = navOf(html);
  assert.ok(nav.includes('#a'));
  assert.ok(nav.includes('#b'));
  assert.ok(nav.includes('#c'));
});

test('toc：allowMultiToc=false 只渲染第一个', async () => {
  const config = createConfig({ markdown: { toc: { allowMultiToc: false } } });
  const { html } = await renderMarkdown('[[toc]]\n\n[[toc]]\n\n## A', { config });
  assert.equal(renderedNavs(html), 1);
});

test('toc：默认允许多个目录', async () => {
  const { html } = await renderMarkdown('[[toc]]\n\n[[toc]]\n\n## A');
  assert.equal(renderedNavs(html), 2);
});
