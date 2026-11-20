import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createConfig, renderMarkdown } from '../src/index.js';

test('media：!video[标题](url) 渲染为 video 标签', async () => {
  const { html } = await renderMarkdown('!video[演示视频](demo.mp4)');
  assert.ok(html.includes('<video class="vp-media" controls src="/demo.mp4" title="演示视频">演示视频</video>'));
});

test('media：!audio[标题](url) 渲染为 audio 标签', async () => {
  const { html } = await renderMarkdown('!audio[提示音](notify.mp3)');
  assert.ok(html.includes('<audio class="vp-media" controls src="/notify.mp3" title="提示音">提示音</audio>'));
});

test('media：相对路径按 dir 解析', async () => {
  const { html } = await renderMarkdown('!video[视频](v.mp4)', { dir: 'guide/' });
  assert.ok(html.includes('src="/guide/v.mp4"'));
});

test('media：base 前缀生效', async () => {
  const config = createConfig({ base: '/doc/' });
  const { html } = await renderMarkdown('!audio[音频](a.mp3)', { dir: 'guide/', config });
  assert.ok(html.includes('src="/doc/guide/a.mp3"'));
});

test('media：协议 URL 原样保留', async () => {
  const { html } = await renderMarkdown('!video[远端](https://cdn.test/v.mp4)');
  assert.ok(html.includes('src="https://cdn.test/v.mp4"'));
});

test('media：空标题不带 title 属性', async () => {
  const { html } = await renderMarkdown('!video[](v.mp4)');
  assert.ok(html.includes('<video class="vp-media" controls src="/v.mp4">'));
  assert.ok(!html.includes('title="'));
});

test('media：标题按 HTML 转义', async () => {
  const { html } = await renderMarkdown('!video[<脚本>](v.mp4)');
  assert.ok(html.includes('title="&lt;脚本&gt;"'));
  assert.ok(!html.includes('<脚本>'));
});

test('media：不影响普通图片与链接', async () => {
  const { html } = await renderMarkdown('![图](a.png)\n\n[文](b.md)');
  assert.ok(html.includes('<img'));
  assert.ok(html.includes('<a href="/b"'));
  assert.ok(!html.includes('<video'));
  assert.ok(!html.includes('<audio'));
});

test('media：非 video/audio 前缀保持原文', async () => {
  const { html } = await renderMarkdown('!foo[bar](x.mp4)');
  assert.ok(!html.includes('<video'));
  assert.ok(!html.includes('<audio'));
});
