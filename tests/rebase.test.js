import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/index.js';

test('渲染期的 rebase：marker 不输出，被包含文件的相对链接按其目录解析', async () => {
  const src =
    '<!-- @include-start: guide/parts/ -->\n\n[链接](./next.md)\n\n<!-- @include-end -->\n\n[页面链接](./other.md)';
  const { html } = await renderMarkdown(src);
  assert.equal(html.includes('@include-start'), false);
  assert.equal(html.includes('@include-end'), false);
  assert.match(html, /href="\/guide\/parts\/next"/);
  assert.match(html, /href="\/other"/);
});
