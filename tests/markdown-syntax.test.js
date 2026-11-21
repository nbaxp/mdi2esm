import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

import { createConfig, md, renderMarkdown } from '../src/index.js';

const render = async (source, config = createConfig()) => (await renderMarkdown(source, { config })).html.trim();

test('mark：==文本== 渲染为 <mark>', async () => {
  assert.equal(await render('==高亮=='), '<p><mark>高亮</mark></p>');
});

test('sub：H~2~O 渲染为 <sub>', async () => {
  assert.equal(await render('H~2~O'), '<p>H<sub>2</sub>O</p>');
});

test('sup：x^2^ 渲染为 <sup>', async () => {
  assert.equal(await render('x^2^'), '<p>x<sup>2</sup></p>');
});

test('行内脚注 ^[...] 不被上标规则吞掉', async () => {
  const html = await render('脚注^[行内注释]。\n\n[^1]: 尾部脚注');
  assert.match(html, /footnote-ref/);
  assert.ok(!html.includes('<sup>'));
});

test('三者在代码块内不生效', async () => {
  const html = await render('```md\n==高亮== H~2~O x^2^\n```');
  assert.ok(!html.includes('<mark>'));
  assert.ok(!html.includes('<sub>'));
  assert.ok(!html.includes('<sup>'));
});

test('```diff 代码块按行加 .diff 标记（复用 notation 行样式）', async () => {
  const html = await render('```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n```');
  assert.match(html, /class="line diff add"/);
  assert.match(html, /class="line diff remove"/);
  // 文件头与 hunk 头不标
  assert.match(html, /<span class="line"><span class="token coord"[^>]*>--- a\/x<\/span><\/span>/);
  // Prism diff 语法的 +/- 符号 span 已移除，符号由 .diff::before 画
  assert.ok(!html.includes('token prefix'));
});

test('嵌套 md 代码块内的 [!code] 是展示内容，不被处理', async () => {
  const src = '````md\n```js\nconst a = 1 // [!code focus]\n```\n````';
  const html = await render(src);
  assert.ok(html.includes('[!code focus]'), html);
  assert.ok(!html.includes('has-focus'), html);
  assert.ok(!html.includes('has-focused-lines'), html);
});

test('普通 fence 内的 [!code] 仍正常处理（嵌套跳过不影响）', async () => {
  const html = await render('```js\nconst a = 1 // [!code focus]\n```');
  assert.ok(html.includes('has-focus'), html);
  assert.ok(html.includes('has-focused-lines'), html);
  assert.ok(!html.includes('[!code'));
  // 对齐 VitePress：has-focused-lines 必须在 <pre> 上（官方 CSS 选择器要求它是 [language-*] 的后代），
  // 不能挂在外层 div 上，否则聚焦模糊样式不生效
  assert.match(html, /<pre[^>]*class="[^"]*has-focused-lines/);
  assert.doesNotMatch(html, /<div class="language-js[^"]*has-focused-lines/);
});

test('fence：[!code ++]/-- notation 移除标记并加整行类', async () => {
  const html = await render("```js\nmsg: 'Removed' // [!code --]\nmsg: 'Added' // [!code ++]\n```");
  assert.match(html, /class="line diff remove"/);
  assert.match(html, /class="line diff add"/);
  assert.ok(!html.includes('[!code'));
});

test('markdown.mark/sub/sup: false 时移除对应规则', () => {
  // 规则开关按 md 单例生效，必须在独立进程里验证
  const script = `
    import { createConfig, renderMarkdown } from './src/index.js';
    const { html } = await renderMarkdown('==a== H~2~O x^2^', {
      config: createConfig({ markdown: { mark: false, sub: false, sup: false } }),
    });
    console.log(html.trim());
  `;
  const html = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim();
  assert.equal(html, '<p>==a== H~2~O x^2^</p>');
});

test('md 实例仍可直接渲染', () => {
  assert.equal(md.render('==x==').trim(), '<p><mark>x</mark></p>');
});
