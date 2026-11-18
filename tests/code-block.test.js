import assert from 'node:assert/strict';
import { test } from 'node:test';

import MarkdownIt from 'markdown-it';

import { applyCodeBlock, maskFenceMarkers, unmaskFenceMarkers } from '../src/code-block.js';
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
