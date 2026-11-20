import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/index.js';
import { buildTableChartOption } from '../src/table-chart.js';

const SOURCE = `|:line: {title: {text: '销量'}} | Q1 | Q2 |
| --- | --- | --- |
| 产品A | 120 | 132 |
| 产品B | 220 | 182 |`;

test('表格转图表：首格声明 → EChartsTableBlock，原表格保留', async () => {
  const { html } = await renderMarkdown(SOURCE);
  assert.match(html, /<EChartsTableBlock type="line" /);
  assert.match(html, /<table tabindex="0">/);
  // options / header / rows 编码进属性，解码后是原数据
  assert.equal(decodeURIComponent(/options="([^"]*)"/.exec(html)[1]), "{title: {text: '销量'}}");
  assert.deepEqual(JSON.parse(decodeURIComponent(/header="([^"]*)"/.exec(html)[1])), ['Q1', 'Q2']);
  assert.deepEqual(JSON.parse(decodeURIComponent(/rows="([^"]*)"/.exec(html)[1])), [
    ['产品A', '120', '132'],
    ['产品B', '220', '182'],
  ]);
  // 首格声明从表头抹掉
  assert.match(html, /<th><\/th>/);
});

test('表格转图表：无 options 时默认 {}', async () => {
  const { html } = await renderMarkdown('|:pie:|名称|值|\n|---|---|---|\n|A|1|2|');
  assert.match(html, /type="pie"/);
  assert.equal(decodeURIComponent(/options="([^"]*)"/.exec(html)[1]), '{}');
});

test('表格转图表：普通表格不受影响', async () => {
  const { html } = await renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');
  assert.doesNotMatch(html, /EChartsTableBlock/);
  assert.match(html, /<table tabindex="0">/);
});

test('表格转图表：单元格 markdown 提取为纯文本', async () => {
  const { html } = await renderMarkdown('|:bar:|Q1|\n|-|-|\n|**A**|`1`|');
  assert.deepEqual(JSON.parse(decodeURIComponent(/rows="([^"]*)"/.exec(html)[1])), [['A', '1']]);
});

test('buildTableChartOption：通用类型按行生成 series', () => {
  const option = buildTableChartOption(
    'line',
    { title: { text: 'x' } },
    ['Q1', 'Q2'],
    [
      ['A', '1', '2'],
      ['B', '3', '4'],
    ],
  );
  assert.deepEqual(option.title, { text: 'x' });
  assert.deepEqual(option.xAxis, { type: 'category', data: ['Q1', 'Q2'] });
  assert.deepEqual(option.yAxis, { type: 'value' });
  assert.deepEqual(option.series, [
    { name: 'A', type: 'line', data: [1, 2] },
    { name: 'B', type: 'line', data: [3, 4] },
  ]);
});

test('buildTableChartOption：pie/funnel 用名称/值两列', () => {
  const option = buildTableChartOption(
    'pie',
    {},
    ['名称', '值'],
    [
      ['A', '1'],
      ['B', '2'],
    ],
  );
  assert.deepEqual(option.series, [
    {
      type: 'pie',
      data: [
        { name: 'A', value: 1 },
        { name: 'B', value: 2 },
      ],
    },
  ]);
  assert.equal(option.xAxis, undefined);
});

test('buildTableChartOption：radar 用 indicator', () => {
  const option = buildTableChartOption('radar', {}, ['A', 'B'], [['X', '1', '2']]);
  assert.deepEqual(option.radar, { indicator: [{ name: 'A' }, { name: 'B' }] });
  assert.deepEqual(option.series, [{ type: 'radar', data: [{ name: 'X', value: [1, 2] }] }]);
});

test('buildTableChartOption：非数值转 null，用户 xAxis 不被覆盖', () => {
  const option = buildTableChartOption('bar', { xAxis: { type: 'value' } }, ['Q1'], [['A', 'x']]);
  assert.deepEqual(option.series[0].data, [null]);
  assert.deepEqual(option.xAxis, { type: 'value' });
});
