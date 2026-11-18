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
