import assert from 'node:assert/strict';
import { test } from 'node:test';

// 与库内高亮走同一个 prismjs 模块实例：注册的语言对 highlightBlock 立即生效
import Prism from 'prismjs';

import { highlightBlock } from '../src/index.js';

test('highlightBlock 输出 pre > code 并带 language- 类名', () => {
  const { html, lang, ok } = highlightBlock('const a = 1;', 'ts');
  assert.equal(ok, true);
  // lang 为归一化后的入参名，与 Prism 注册的别名一致
  assert.equal(lang, 'ts');
  assert.match(html, /^<pre class="language-ts"><code>/);
  assert.match(html, /class="token keyword"/);
});

test('highlightBlock 每行包 .line，行数与时序一致', () => {
  const { html } = highlightBlock('let a = 1;\nlet b = 2;', 'js');
  assert.equal(html.match(/<span class="line/g).length, 2);
});

test('highlightBlock 支持 meta 行高亮', () => {
  const { html } = highlightBlock('a\nb\nc', 'js', { meta: '{2}' });
  const lines = html.match(/<span class="line[^"]*"/g);
  assert.equal(lines[1], '<span class="line highlighted"');
});

test('未注册语言退化为转义纯文本', () => {
  const { html, ok } = highlightBlock('<div>x</div>', 'unknown-lang');
  assert.equal(ok, false);
  assert.match(html, /&lt;div&gt;x&lt;\/div&gt;/);
  assert.match(html, /language-unknown-lang/);
});

test('语言名注入被清洗，不会破坏 class 属性', () => {
  const { html } = highlightBlock('x', 'js"><script>');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /^<pre class="language-/);
});

test('语言注册进共享 Prism 实例后 highlightBlock 可用', () => {
  Prism.languages.demo = { keyword: /\bdemo\b/ };
  const { html, ok } = highlightBlock('demo 1', 'demo');
  assert.equal(ok, true);
  assert.equal(
    html,
    '<pre class="language-demo"><code><span class="line"><span class="token keyword">demo</span> 1</span></code></pre>',
  );
});
