import assert from 'node:assert/strict';
import { test } from 'node:test';

import MarkdownIt from 'markdown-it';

import { applyCodeBlock, maskFenceMarkers, unmaskFenceMarkers } from '../src/code-block.js';
import md from '../src/markdown-it.js';
import { applyLineNumbers } from '../src/markdown-plugins.js';

function freshMd() {
  const m = new MarkdownIt();
  applyCodeBlock(m);
  return m;
}

test('applyLineNumbers 全局开启时给代码块加行号 wrapper', () => {
  const m = freshMd();
  applyLineNumbers(m, true);
  assert.match(m.render('```js\nconst a = 1;\n```'), /line-numbers-wrapper/);
});

test('applyLineNumbers 全局关闭时默认不加行号，但 :line-numbers 标注可开', () => {
  const m = freshMd();
  applyLineNumbers(m, false);
  assert.ok(!/line-numbers-wrapper/.test(m.render('```js\nconst a = 1;\n```')));
  assert.match(m.render('```js :line-numbers\nconst a = 1;\n```'), /line-numbers-wrapper/);
});

test('maskFenceMarkers：只遮蔽围栏内以冒号开头的行，unmask 可还原', () => {
  const source = ': outside\n```js\n:line-numbers\nconst a = 1;\n```\n: after';
  const masked = maskFenceMarkers(source);
  assert.equal(masked.split('\n')[0], ': outside');
  assert.notEqual(masked.split('\n')[2], ':line-numbers');
  assert.equal(unmaskFenceMarkers(masked), source);
});

test('maskFenceMarkers：非围栏内的冒号行不遮蔽', () => {
  const source = ':tip\n正文';
  assert.equal(maskFenceMarkers(source), source);
});

test('fence: [!code info]/hl 行标记，pre 带 has-highlighted', () => {
  const html = freshMd().render('```js\nconst a = 1 // [!code info]\nconst b = 2 // [!code hl]\n```');
  assert.match(html, /class="line highlighted info"/);
  assert.match(html, /class="line highlighted"/);
  assert.match(html, /pre v-pre class="shiki has-highlighted"/);
  assert.ok(!html.includes('[!code'));
});

test('fence: [!code highlight:2] 独占行从下一行起算（v3）', () => {
  const html = freshMd().render('```js\n// [!code highlight:2]\na\nb\nc\n```');
  const lines = html.match(/<span class="line[^"]*"/g);
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '<span class="line highlighted"');
  assert.equal(lines[1], '<span class="line highlighted"');
  assert.equal(lines[2], '<span class="line"');
});

test('fence: [!code ++] 行尾注释 pre 带 has-diff', () => {
  const html = freshMd().render('```js\na // [!code ++]\n```');
  assert.match(html, /pre v-pre class="shiki has-diff"/);
});

test('fence: ```diff pre 带 has-diff', () => {
  const html = freshMd().render('```diff\n- a\n+ b\n```');
  assert.match(html, /pre v-pre class="shiki has-diff"/);
});

test('fence: [title] 渲染 .vp-code-block-title 标题栏', () => {
  const html = freshMd().render('```js [snippet.js]\nconst a = 1;\n```');
  assert.match(
    html,
    /<div class="vp-code-block-title"><div class="vp-code-block-title-bar"><span class="vp-code-block-title-text" data-title="snippet\.js">snippet\.js<\/span><\/div><div class="language-js"/,
  );
  assert.ok(!html.includes('[snippet.js]'));
});

test('fence: [title] 内容按 HTML 转义', () => {
  const html = freshMd().render('```js [<b>x</b>]\nconst a = 1;\n```');
  assert.match(html, /data-title="&lt;b&gt;x&lt;\/b&gt;"/);
  assert.ok(!html.includes('<b>x</b>'));
});

test('fence: [title] 在代码组内只作 tab 标签，不渲染标题栏', () => {
  const html = md.render(
    '::: code-group\n```js [snippet.js]\nconst a = 1;\n```\n```ts [config.ts]\nconst b = 2;\n```\n:::',
    {},
  );
  assert.match(html, /<label data-title="snippet\.js" for="tab-\d+">snippet\.js<\/label>/);
  assert.match(html, /<label data-title="config\.ts" for="tab-\d+">config\.ts<\/label>/);
  assert.ok(!html.includes('vp-code-block-title'));
});
