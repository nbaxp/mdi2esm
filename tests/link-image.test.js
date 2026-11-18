import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/index.js';

test('http(s) 外链追加图标且加 target/rel', async () => {
  const { html } = await renderMarkdown('[VitePress](https://vitepress.dev) 文本');
  assert.match(html, /<a href="https:\/\/vitepress\.dev" target="_blank" rel="noreferrer">VitePress/);
  assert.match(html, /vp-external-link-icon/);
  assert.match(html, /<svg/);
  assert.match(html, /VitePress<svg[^>]*vp-external-link-icon/);
});

test('mailto/tel 外链只加 target，不加图标', async () => {
  const { html } = await renderMarkdown('[邮件](mailto:a@b.com) [电话](tel:123)');
  assert.match(html, /target="_blank"/);
  assert.equal(html.includes('vp-external-link-icon'), false);
});

test('内部链接不加 target 与图标', async () => {
  const { html } = await renderMarkdown('[内部](/guide/index.md)');
  assert.equal(html.includes('target="_blank"'), false);
  assert.equal(html.includes('vp-external-link-icon'), false);
});

test('image =WxH 解析为 width/height 并剥离尺寸后缀', async () => {
  const { html } = await renderMarkdown('![a](img.png =200x300)');
  assert.match(html, /<img src="[^"]*img\.png"[^>]*width="200" height="300" loading="lazy">/);
});

test('image =Wx 仅设置 width', async () => {
  const { html } = await renderMarkdown('![a](img.png =200x)');
  assert.match(html, /width="200"/);
  assert.ok(!/height="\d+"/.test(html));
});

test('image =xH 仅设置 height', async () => {
  const { html } = await renderMarkdown('![a](img.png =x300)');
  assert.match(html, /height="300"/);
  assert.ok(!/width="\d+"/.test(html));
});

test('外链 image =WxH 同样设置尺寸且不改 src（外链不附加 loading）', async () => {
  const { html } = await renderMarkdown('![a](https://x.com/a.png =100x50)');
  assert.match(html, /<img src="https:\/\/x\.com\/a\.png"[^>]*width="100" height="50"/);
  assert.ok(!/loading="lazy"/.test(html));
});

test('无尺寸语法的图片不含 width/height', async () => {
  const { html } = await renderMarkdown('![a](img.png)');
  assert.ok(!/width=/.test(html));
  assert.ok(!/height=/.test(html));
});
