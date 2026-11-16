import assert from 'node:assert/strict';
import { test } from 'node:test';

import { highlightCode, normalizeLang, renderMarkdown } from '../src/index.js';

test('Prism 高亮：C# 关键字输出 token 类', () => {
  const html = highlightCode('public class A {}', 'csharp');
  assert.match(html, /class="token keyword"/);
  assert.match(html, /class="token class-name"/);
});

test('Prism 高亮：未知语言返回 null，由调用方转义', () => {
  assert.equal(highlightCode('const a = 1;', 'not-a-language'), null);
});

test('语言别名：vue-html / shellscript / ts:no-line-numbers / bat', () => {
  assert.equal(normalizeLang('vue-html'), 'markup');
  assert.equal(normalizeLang('shellscript'), 'bash');
  assert.equal(normalizeLang('ts:no-line-numbers'), 'ts');
  assert.equal(normalizeLang('bat'), 'batch');
});

test('fence 渲染：Prism token 与 .line 包裹同时存在', () => {
  const { html } = renderMarkdown('```csharp\npublic class A {}\n```');
  assert.match(html, /class="token keyword"/);
  assert.match(html, /<span class="line">/);
});

test('fence 行高亮：{1,3} 给对应行加 highlighted', () => {
  const { html } = renderMarkdown('```js {1,3}\nconst a = 1;\nconst b = 2;\n```');
  assert.match(html, /<span class="line highlighted">/);
  assert.match(html, /<span class="line">/);
});
