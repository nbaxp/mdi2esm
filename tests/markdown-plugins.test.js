import assert from 'node:assert/strict';
import { test } from 'node:test';

import MarkdownIt from 'markdown-it';

import { applyLineNumbers, ensureEmojiPlugin, fenceMetaAttrs, normalizeHash, renderMarkdown } from '../src/index.js';

test('官方 anchor 插件：id / .header-anchor / 中文 slug / outline 收集', () => {
  const { html, headings } = renderMarkdown('## 小节 abc\n\n正文');
  assert.match(
    html,
    /<h2 id="小节-abc">小节 abc <a class="header-anchor" href="#小节-abc" aria-label="Permalink to “小节 abc”"><\/a><\/h2>/,
  );
  assert.deepEqual(headings, [{ level: 2, title: '小节 abc', slug: '小节-abc' }]);
});

test('官方 attrs 插件：{#custom-id} 覆盖自动 slug', () => {
  const { html, headings } = renderMarkdown('# 标题 {#custom-id}\n\n## 正文');
  assert.match(html, /<h1 id="custom-id">/);
  assert.equal(headings[0].slug, '正文');
});

test('官方 toc 插件：[[toc]] 生成与 anchor 一致的链接', () => {
  const { html } = renderMarkdown('[[toc]]\n\n## 小节 abc\n\n### 子节');
  assert.match(html, /<nav class="table-of-contents"><ul><li><a href="#小节-abc">小节 abc<\/a><ul>/);
  assert.match(html, /<li><a href="#子节">子节<\/a><\/li><\/ul><\/li><\/ul><\/nav>/);
});

test('官方 footnote / tasklist / cjk 插件：对应 DOM 与行内脚注', () => {
  const { html } = renderMarkdown('**中文**粗体 行内脚注^[note]\n\n- [x] 完成');
  assert.match(html, /<p><strong>中文<\/strong>粗体 行内脚注<sup class="footnote-ref">/);
  assert.match(html, /<section class="footnotes">/);
  assert.match(html, /<ul class="task-list-container">/);
  assert.match(html, /class="task-list-item-checkbox" checked="checked" disabled="disabled"/);
});

test('emoji：markdown-it-emoji（full 数据）把 :名字: 翻成字符，图标短码不受影响', async () => {
  // emoji 插件不内置：动态 import 挂载（幂等），测试环境装了 devDependency，await 等它挂上
  await ensureEmojiPlugin();
  const { html } = renderMarkdown(':i-mdi-home: 和 :i-demo-spark: 以及 :tada: :+1: :100:');
  assert.match(html, /<p><Icon icon="mdi:home" \/> 和 <Icon icon="demo:spark" \/> 以及 🎉 👍 💯<\/p>/);
});

test('emoji：:i-foo: 与时间、版本号、行内代码保持原文', () => {
  const { html } = renderMarkdown(':i-foo: 时间 12:30:00，版本 1:2:3，行内 `:tada:` 保持原样');
  assert.ok(html.includes(':i-foo:'));
  assert.ok(html.includes('12:30:00'));
  assert.ok(html.includes('1:2:3'));
  assert.ok(html.includes('<code v-pre>:tada:</code>'));
});

test('短码：标题里出现短码时 title/slug 不带短码原文', () => {
  const { headings } = renderMarkdown('## 图标 :i-mdi-home: 示例');
  assert.equal(headings[0].title, '图标 示例');
  assert.equal(headings[0].slug, '图标-示例');
});

test('官方 table 插件：表格可键盘聚焦', () => {
  const { html } = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');
  assert.match(html, /<table tabindex="0">/);
});

test('官方 restoreEntities：裸 & 转义，实体保留给 Vue 编译器解码', () => {
  const { html, headings } = renderMarkdown('## A & B\n\nA & B &copy; C and a < b');
  assert.match(html, /A &amp; B &copy; C and a &lt; b/);
  assert.equal(headings[0].title, 'A & B');
});

test('官方 link/image 规则：外链属性、hash slugify、.md 路由、图片懒加载', () => {
  const { html } = renderMarkdown(
    '[外链](https://example.com)\n\n[锚](#小节%20abc)\n\n[文档](./foo.md#小节%20abc)\n\n![图](./a.png)',
  );
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noreferrer">外链/);
  assert.match(html, /<a href="#小节-abc">锚<\/a>/);
  assert.match(html, /href="[^"]*foo#小节-abc"/);
  assert.match(html, /<img[^>]*loading="lazy"/);
});

test('normalizeHash 与 anchor 共用 slugify', () => {
  assert.equal(normalizeHash('小节%20abc'), '#小节-abc');
  assert.equal(normalizeHash(''), '');
});

test('fenceMetaAttrs 对齐官方 highlight.ts：剥出语言后的元信息', () => {
  assert.equal(fenceMetaAttrs('js{1,3}'), '{1,3}');
  assert.equal(fenceMetaAttrs('ts:line-numbers=2 {1}'), ':line-numbers=2 {1}');
  assert.equal(fenceMetaAttrs('js'), '');
});

function makeFenceMd(enableLineNumbers) {
  const md = new MarkdownIt();
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const lang = /^[a-zA-Z0-9-_]+/.exec(token.info)?.[0] ?? '';
    const code = md.utils.escapeHtml(token.content);
    return `<div class="language-${lang}" dir="ltr"><pre><code>${code}</code></pre></div>`;
  };
  applyLineNumbers(md, enableLineNumbers);
  return md;
}

test('官方 lineNumbers：默认关闭，:line-numbers=2 指定起始行号', () => {
  const md = makeFenceMd(false);
  assert.equal(md.render('```ts\nconst a = 1;\n```').includes('line-numbers-mode'), false);
  const html = md.render('```ts:line-numbers=2\nconst a = 1;\nconst b = 2;\n```');
  assert.match(html, /class="language-ts line-numbers-mode"/);
  assert.match(
    html,
    /<div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">2<\/span><br><span class="line-number">3<\/span><br><\/div>/,
  );
});

test('官方 lineNumbers：全局开启时 :no-line-numbers 可覆盖', () => {
  const md = makeFenceMd(true);
  assert.match(md.render('```ts\nconst a = 1;\n```'), /class="language-ts line-numbers-mode"/);
  assert.equal(md.render('```ts:no-line-numbers\nconst a = 1;\n```').includes('line-numbers-mode'), false);
});
