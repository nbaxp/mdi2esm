import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/index.js';

const OPTION = JSON.stringify({ xAxis: { type: 'category' }, series: [{ data: [1, 2, 3] }] });

test('fence: ```echarts 输出 EChartsBlock（JSON 编码进属性）', async () => {
  const { html } = await renderMarkdown(`\`\`\`echarts\n${OPTION}\n\`\`\``);
  assert.match(html, /<EChartsBlock code="/);
  assert.ok(html.includes(encodeURIComponent(OPTION)));
});

test('fence: 非 echarts 语言不受影响', async () => {
  const { html } = await renderMarkdown('```js\nconst a = 1;\n```');
  assert.doesNotMatch(html, /EChartsBlock/);
});

// option 是 JS 对象字面量（可含函数），组件用 Blob URL 动态 import 求值，
// 因此 fence 输出必须原样保留字面量（这里只验证传递链路，求值在浏览器验证）
test('fence: echarts 字面量（无引号 key / 单引号 / 函数 / 末尾分号）原样传递', async () => {
  const literal = `{
  title: { text: '利用代码块直接渲染' },
  xAxis: { type: 'category', data: ['Mon', 'Tue'] },
  series: [{ type: 'line', data: [120, 132], smooth: (v) => v > 100 }]
};`;
  const { html } = await renderMarkdown(`\`\`\`echarts\n${literal}\n\`\`\``);
  assert.match(html, /<EChartsBlock code="/);
  const code = decodeURIComponent(/code="([^"]*)"/.exec(html)[1]);
  assert.equal(code.trim(), literal.trim());
  assert.ok(code.includes('(v) => v > 100'));
});
