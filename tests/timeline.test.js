import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/index.js';

const SAMPLE = `:::timeline 发展历程
:: [milestone] 2021-07 项目开源
  Cherry Markdown 正式在 GitHub 开源
:: [done] 2024-05 支持流式增量渲染
  提供**流式**渲染的[包](https://example.com/pkg)
:: [doing] 持续迭代
  - 丰富语法生态
  - 持续修复反馈
:: [todo] 拥抱社区
  欢迎贡献
:: [error] VSCode 插件
  对齐主仓
:: [x] 别名-完成
:: [✓] 别名-完成2
:: [~] 别名-进行中
:: […] 别名-进行中2
:: [★] 别名-里程碑
:: [*] 别名-里程碑2
:: [!] 别名-异常
:: [×] 别名-异常2
:: [] 别名-待办
:: [ ] 别名-待办2
:: 无状态节点
  描述
:::`;

test('timeline：完整示例渲染结构', async () => {
  const { html } = await renderMarkdown(SAMPLE);
  assert.ok(html.includes('<div class="mdi-timeline"><div class="mdi-timeline__header">发展历程</div>'));
  assert.ok(html.includes('<div class="mdi-timeline__item mdi-timeline__item--milestone">'));
  assert.ok(html.includes('<div class="mdi-timeline__time">2021-07</div>'));
  assert.ok(html.includes('<div class="mdi-timeline__title">项目开源</div>'));
  assert.ok(html.includes('mdi-timeline__desc'));
  assert.ok(html.includes('<strong>流式</strong>'));
  assert.ok(html.includes('<a href="https://example.com/pkg"'));
});

test('timeline：状态别名映射', async () => {
  const { html } = await renderMarkdown(SAMPLE);
  const states = [...html.matchAll(/mdi-timeline__item--(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(states, [
    'milestone',
    'done',
    'doing',
    'todo',
    'error',
    'done',
    'done',
    'doing',
    'doing',
    'milestone',
    'milestone',
    'error',
    'error',
    'todo',
    'todo',
    'todo',
  ]);
});

test('timeline：无日期节点只输出标题', async () => {
  const { html } = await renderMarkdown(':::timeline\n:: [doing] 持续迭代\n  描述\n:::');
  assert.ok(html.includes('<div class="mdi-timeline__item mdi-timeline__item--doing">'));
  assert.ok(html.includes('<div class="mdi-timeline__title">持续迭代</div>'));
  assert.ok(!html.includes('mdi-timeline__time'));
  assert.ok(!html.includes('mdi-timeline__header'));
});

test('timeline：无状态首行按 todo 处理', async () => {
  const { html } = await renderMarkdown(':::timeline\n:: 无状态节点\n  描述\n:::');
  assert.ok(html.includes('mdi-timeline__item--todo'));
  assert.ok(html.includes('<div class="mdi-timeline__title">无状态节点</div>'));
});

test('timeline：描述支持列表与行内 markdown', async () => {
  const { html } = await renderMarkdown(':::timeline\n:: [todo] 待办\n  - 一\n  - 二\n:::');
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<li>一</li>'));
});

test('timeline：描述内链接按 dir 重写', async () => {
  const { html } = await renderMarkdown(':::timeline\n:: [todo] 待办\n  [文](u.md)\n:::', { dir: 'guide/' });
  assert.ok(html.includes('href="/guide/u"'));
});

test('timeline：节点内标题不污染主文档 headings', async () => {
  const { html, headings } = await renderMarkdown(':::timeline\n:: [todo] 待办\n  ## 节点内标题\n:::');
  assert.ok(html.includes('<h2'));
  assert.deepEqual(headings, []);
});

test('timeline：描述不携带主文档脚注', async () => {
  const { html } = await renderMarkdown('正文[^1]\n\n:::timeline\n:: [todo] 待办\n  描述\n:::\n\n[^1]: 脚注内容');
  const desc = /<div class="mdi-timeline__desc">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
  assert.ok(!desc.includes('footnotes-sep'));
  assert.ok(!desc.includes('footnotes-list'));
});

test('timeline：未闭合容器不渲染为时间线', async () => {
  const { html } = await renderMarkdown(':::timeline\n:: [todo] 待办\n  描述');
  assert.ok(!html.includes('mdi-timeline'));
});

test('timeline：普通 ::: 容器不受影响', async () => {
  const { html } = await renderMarkdown(':::tip 提示\n内容\n:::');
  assert.ok(html.includes('custom-block'));
  assert.ok(!html.includes('mdi-timeline'));
});
