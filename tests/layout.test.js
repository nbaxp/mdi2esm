import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/index.js';

test('对齐容器：left/center/right/justify 及简写', async () => {
  const { html } = await renderMarkdown('::: center\n居中\n:::\n\n::: right\n右侧\n:::\n\n::: j\n两端\n:::\n');
  assert.ok(html.includes('<div class="mdi-align mdi-align-center">'));
  assert.ok(html.includes('<div class="mdi-align mdi-align-right">'));
  assert.ok(html.includes('<div class="mdi-align mdi-align-justify">'));
  assert.ok(!html.includes(':::'));
});

test('多列容器：:: 分列，列数自动推断', async () => {
  const { html } = await renderMarkdown('::: cols\n第一列\n::\n第二列\n::\n第三列\n:::\n');
  assert.ok(html.includes('<div class="mdi-cols mdi-cols-3">'));
  assert.equal((html.match(/<div class="mdi-col">/g) ?? []).length, 3);
  assert.ok(html.includes('<p>第一列</p>'));
  assert.ok(html.includes('<p>第三列</p>'));
});

test('多列容器：2cols/3cols 别名与列内对齐', async () => {
  const { html } = await renderMarkdown('::: 2cols\n左\n::\n右\n:::\n\n::: cols center\n居中 A\n::\n居中 B\n:::\n');
  assert.ok(html.includes('<div class="mdi-cols mdi-cols-2">'));
  assert.ok(html.includes('<div class="mdi-cols mdi-cols-2 mdi-cols-align-center">'));
});

test('选项卡：:: 标题生成 radio/label/panel，首个默认选中', async () => {
  const { html } = await renderMarkdown('::: tabs\n:: 说明\n说明内容 **粗**\n:: 用法\n用法内容\n:::\n');
  assert.ok(html.includes('<div class="mdi-tabs">'));
  assert.ok(html.includes('<label for="mdi-tabs-0-0">说明</label>'));
  assert.ok(html.includes('<label for="mdi-tabs-0-1">用法</label>'));
  assert.ok(html.includes('id="mdi-tabs-0-0" checked'));
  assert.ok(!html.includes('id="mdi-tabs-0-1" checked'));
  assert.equal((html.match(/<div class="mdi-tab-panel">/g) ?? []).length, 2);
  assert.ok(html.includes('<strong>粗</strong>'));
});

test('选项卡：面板内代码块与 :: 标题不误判', async () => {
  const { html } = await renderMarkdown('::: tabs\n:: 代码\n```md\n:: 不是分隔符\n:::\n```\n:: 结束\nOK\n:::\n');
  assert.equal((html.match(/<div class="mdi-tab-panel">/g) ?? []).length, 2);
  assert.ok(html.includes(':: 不是分隔符')); // 保留在代码块内
  assert.ok(html.includes('<p>OK</p>'));
});

test('多列容器：脚注引用正确，定义只输出一次', async () => {
  const { html } = await renderMarkdown('::: cols center\n引用[^x]在此\n::\n第二列\n:::\n\n[^x]: 脚注定义\n\n文末。\n');
  assert.ok(html.includes('class="footnote-ref"'));
  assert.equal((html.match(/class="footnotes"/g) ?? []).length, 1);
  assert.ok(html.includes('脚注定义'));
});

test('未闭合布局容器交回普通 markdown', async () => {
  const { html } = await renderMarkdown('::: center\n未闭合内容\n');
  assert.ok(!html.includes('mdi-align'));
  assert.ok(html.includes('::: center'));
});
