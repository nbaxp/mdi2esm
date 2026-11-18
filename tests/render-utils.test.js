import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildOutline, renderMarkdown } from '../src/index.js';
import { escapeInvalidInterpolations, resolvePath } from '../src/render.js';

test('resolvePath：处理 ./ 与 ../', () => {
  assert.equal(resolvePath('guide/', './a.md'), 'guide/a.md');
  assert.equal(resolvePath('guide/parts/', '../a.md'), 'guide/a.md');
  assert.equal(resolvePath('', 'a/b/../c.md'), 'a/c.md');
});

test('buildOutline：按 level 生成层级树', async () => {
  const { headings } = await renderMarkdown('## A\n### B\n## C');
  const tree = buildOutline(headings);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].title, 'A');
  assert.equal(tree[0].children[0].title, 'B');
  assert.equal(tree[1].title, 'C');
});

test('renderMarkdown 收集 h2-h6 标题（h1 页面标题不进目录）', async () => {
  const { headings: collected } = await renderMarkdown('# H1\n## H2\n### H3\n#### H4\n##### H5');
  assert.deepEqual(
    collected.map((h) => h.level),
    [2, 3, 4, 5],
  );
});

test('escapeInvalidInterpolations：合法插值保留，非法插值转义为实体', () => {
  assert.equal(escapeInvalidInterpolations('文本 {{ $frontmatter.title }} 尾'), '文本 {{ $frontmatter.title }} 尾');
  assert.equal(escapeInvalidInterpolations('{{ $frontmatter.a.b }}'), '{{ $frontmatter.a.b }}');
  assert.equal(
    escapeInvalidInterpolations('{{ $frontmatter..title }}'),
    '&#123;&#123; $frontmatter..title &#125;&#125;',
  );
});
