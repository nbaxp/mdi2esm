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

test('highlightBlock 对 diff / diff-js 按行加 .diff 标记', () => {
  const { html } = highlightBlock('+ a\n- b', 'diff');
  assert.match(html, /^<pre class="language-diff"><code>/);
  assert.match(html, /class="line diff add"/);
  assert.match(html, /class="line diff remove"/);
  assert.ok(!html.includes('token prefix'));
  // diff-js 未注册语法，回落 diff 语法
  const js = highlightBlock('+ const a = 1;\n- const b = 2;', 'diff-js');
  assert.equal(js.ok, true);
  assert.match(js.html, /^<pre class="language-diff-js"><code>/);
  assert.match(js.html, /class="line diff add"/);
});

test('diff 增删行结构一致，内层保留 Prism 官方 token line 类', () => {
  // Prism diff 的 .token.line 保留官方类名；mdoc 侧 .vp-doc .line 的误伤由 mdoc 样式方案处理。
  const { html } = highlightBlock('- a\n+ b', 'diff');
  assert.ok(html.includes('class="token line"'), '内层 token 保留官方 line 类');
  // remove 行：单 token；add 行：拆行空壳 + 内容 token
  assert.ok(
    html.includes(
      '<span class="line diff remove"><span class="token deleted-sign deleted"><span class="token line"> a</span></span></span>',
    ),
    html,
  );
  assert.ok(
    html.includes(
      '<span class="line diff add"><span class="token deleted-sign deleted"><span class="token line"></span></span><span class="token inserted-sign inserted"><span class="token line"> b</span></span></span>',
    ),
    html,
  );
});

test('[!code ++]/-- notation：移除标记与注释前缀，行加 .diff add/remove', () => {
  const { html } = highlightBlock("msg: 'Removed' // [!code --]\nmsg: 'Added' // [!code ++]", 'js');
  const lines = html.match(/<span class="line[^"]*"/g);
  assert.equal(lines[0], '<span class="line diff remove"');
  assert.equal(lines[1], '<span class="line diff add"');
  assert.ok(!html.includes('[!code'));
  // 注释前缀一并移除，避免留下空的 //
  assert.ok(!html.includes('//'));
});

test('notation 独占注释行整行删除', () => {
  const { html } = highlightBlock('// [!code ++]\nconst a = 1;', 'js');
  assert.equal(html.match(/<span class="line/g).length, 1);
  assert.ok(!html.includes('[!code'));
});

test('notation :N 标记当前行与后续行', () => {
  const { html } = highlightBlock('a // [!code ++:2]\nb\nc', 'js');
  const lines = html.match(/<span class="line[^"]*"/g);
  assert.equal(lines[0], '<span class="line diff add"');
  assert.equal(lines[1], '<span class="line diff add"');
  assert.equal(lines[2], '<span class="line"');
});

test('notation 双叹号（文档转义写法）也识别', () => {
  const { html } = highlightBlock('a // [!!code --]', 'js');
  assert.match(html, /class="line diff remove"/);
  assert.ok(!html.includes('[!!code'));
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
