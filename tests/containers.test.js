import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/index.js';
import { render } from '../src/markdown-it.js';

test('tip 容器渲染为 custom-block 且带默认标题（zh）', async () => {
  const { html } = await renderMarkdown('::: tip\n内容\n:::');
  assert.match(html, /<div class="tip custom-block">/);
  assert.match(html, /<p class="custom-block-title[^"]*">提示<\/p>/);
  assert.ok(html.includes('内容'));
});

test('warning 容器支持自定义标题', async () => {
  const { html } = await renderMarkdown('::: warning 注意安全\n内容\n:::');
  assert.match(html, /<div class="warning custom-block">/);
  assert.match(html, /<p class="custom-block-title">注意安全<\/p>/);
});

test('details 容器渲染为 details/summary', async () => {
  const { html } = await renderMarkdown('::: details\n内容\n:::');
  assert.match(html, /<details class="details custom-block">/);
  assert.match(html, /<summary>详细信息<\/summary>/);
});

test('GitHub alert > [!NOTE] 转为 custom-block', async () => {
  const { html } = await renderMarkdown('> [!NOTE]\n> 内容\n');
  assert.match(html, /<div class="note custom-block github-alert">/);
  assert.match(html, /<p class="custom-block-title">注意<\/p>/);
  assert.ok(html.includes('内容'));
});

test('未知容器类型不渲染为 custom-block', async () => {
  const { html } = await renderMarkdown('::: my-unknown-type\n内容\n:::');
  assert.ok(!/custom-block/.test(html));
});

test('容器：tip/info/warning/danger 输出 custom-block 与默认标题', () => {
  const cases = [
    ['tip', '提示'],
    ['info', '信息'],
    ['warning', '警告'],
    ['danger', '危险'],
  ];
  for (const [name, label] of cases) {
    const html = render(`::: ${name}\n内容\n:::`, {});
    assert.match(
      html,
      new RegExp(
        `<div class="${name} custom-block"><p class="custom-block-title custom-block-title-default">${label}</p>`,
      ),
    );
    assert.match(html, /<p>内容<\/p>/);
    assert.match(html, /<\/div>\n$/);
  }
});

test('容器：details 输出 details/summary 且 {open} 透传', () => {
  const html = render('::: details {open}\n内容\n:::', {});
  assert.equal(
    html,
    '<details class="details custom-block" open="open"><summary>详细信息</summary>\n<p>内容</p>\n</details>\n',
  );
});

test('容器：自定义标题替换默认文案，{no-title} 不输出标题', () => {
  assert.match(render('::: warning 自定义标题\n内容\n:::', {}), /<p class="custom-block-title">自定义标题<\/p>/);
  assert.equal(render('::: tip {no-title}\n内容\n:::', {}).includes('custom-block-title'), false);
});
