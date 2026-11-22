import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from '../src/index.js';
import { buildTableChartOption, normalizeProvinceName } from '../src/table-chart.js';

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

test('buildTableChartOption：radar 用 indicator（带 max）', () => {
  const option = buildTableChartOption('radar', {}, ['A', 'B'], [['X', '1', '2']]);
  assert.deepEqual(option.radar, {
    indicator: [
      { name: 'A', max: 2 },
      { name: 'B', max: 3 },
    ],
  });
  assert.deepEqual(option.series, [{ type: 'radar', data: [{ name: 'X', value: [1, 2] }] }]);
});

test('buildTableChartOption：heatmap 表头 x / 首列 y / 单元格值', () => {
  const option = buildTableChartOption(
    'heatmap',
    {},
    ['Q1', 'Q2'],
    [
      ['A', '1', '2'],
      ['B', '3', '4'],
    ],
  );
  assert.deepEqual(option.xAxis, { type: 'category', data: ['Q1', 'Q2'] });
  assert.deepEqual(option.yAxis, { type: 'category', data: ['A', 'B'] });
  assert.deepEqual(option.series, [
    {
      type: 'heatmap',
      data: [
        [0, 0, 1],
        [1, 0, 2],
        [0, 1, 3],
        [1, 1, 4],
      ],
      label: { show: true },
    },
  ]);
  assert.equal(option.visualMap.min, 1);
  assert.equal(option.visualMap.max, 4);
});

test('buildTableChartOption：sankey 行三列 source/target/value，过滤 value<=0', () => {
  const option = buildTableChartOption(
    'sankey',
    {},
    ['源', '目标', '值'],
    [
      ['A', 'B', '1'],
      ['B', 'C', '0'],
      ['C', 'D', '2'],
    ],
  );
  assert.equal(option.series[0].type, 'sankey');
  assert.deepEqual(option.series[0].layout, 'none');
  assert.deepEqual(option.series[0].emphasis, { focus: 'adjacency' });
  assert.deepEqual(option.series[0].lineStyle, { color: 'source', curveness: 0.5 });
  assert.deepEqual(option.tooltip, { trigger: 'item' });
  assert.deepEqual(option.series[0].links, [
    { source: 'A', target: 'B', value: 1 },
    { source: 'C', target: 'D', value: 2 },
  ]);
  assert.deepEqual(option.series[0].data, [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
});

test('buildTableChartOption：scatter 走 cherry:mapping', () => {
  const option = buildTableChartOption(
    'scatter',
    { 'cherry:mapping': { x: 'X', y: 'Y', size: 'S', group: 'G' } },
    ['名称', 'X', 'Y', 'S', 'G'],
    [
      ['p1', '1', '2', '3', 'a'],
      ['p2', '4', '5', '6', 'b'],
    ],
  );
  assert.equal(option.series.length, 2);
  assert.equal(option.series[0].type, 'scatter');
  assert.deepEqual(option.series[0].data, [{ name: 'p1', value: [1, 2], symbolSize: 6 }]);
  assert.deepEqual(option.series[1].data, [{ name: 'p2', value: [4, 5], symbolSize: 28 }]);
  assert.equal(option['cherry:mapping'], undefined);
});

test('buildTableChartOption：scatter 无 mapping 走关键字回退', () => {
  const option = buildTableChartOption('scatter', {}, ['名称', 'x', 'y'], [['p1', '1', '2']]);
  assert.equal(option.series.length, 1);
  assert.deepEqual(option.series[0].data, [{ name: 'p1', value: [1, 2], symbolSize: 10 }]);
});

test('buildTableChartOption：scatter 缺 x/y 返回空 series', () => {
  const option = buildTableChartOption('scatter', { 'cherry:mapping': { x: 'X' } }, ['名称', 'X'], [['p1', '1']]);
  assert.deepEqual(option.series, []);
});

test('buildTableChartOption：scatter 官方列序（表头无名称列）不错位', () => {
  // 真实管线里 collectTable 抹掉声明格，表头不含"名称"列，比数据行少一列
  const option = buildTableChartOption(
    'scatter',
    { title: '数据散点图' },
    ['横坐标', '纵坐标', '大小', '系列'],
    [
      ['A1', '10', '20', '5', '系列一'],
      ['B1', '12', '18', '8', '系列二'],
    ],
  );
  assert.equal(option.title.text, '数据散点图');
  assert.equal(option.series.length, 2);
  assert.equal(option.series[0].name, '系列一');
  assert.deepEqual(option.series[0].data, [{ name: 'A1', value: [10, 20], symbolSize: 6 }]);
  assert.equal(option.series[1].name, '系列二');
  assert.deepEqual(option.series[1].data, [{ name: 'B1', value: [12, 18], symbolSize: 28 }]);
});

test('buildTableChartOption：scatter 官方 mapping（表头无名称列）不错位', () => {
  const option = buildTableChartOption(
    'scatter',
    { 'cherry:mapping': { x: 'X', y: 'Y', size: 'Size', series: 'Series' } },
    ['X', 'Y', 'Size', 'Series'],
    [
      ['A1', '10', '20', '5', '组一'],
      ['B1', '12', '18', '8', '组二'],
    ],
  );
  assert.equal(option['cherry:mapping'], undefined);
  assert.equal(option.series.length, 2);
  assert.equal(option.series[0].name, '组一');
  assert.deepEqual(option.series[0].data, [{ name: 'A1', value: [10, 20], symbolSize: 6 }]);
  assert.equal(option.series[1].name, '组二');
  assert.deepEqual(option.series[1].data, [{ name: 'B1', value: [12, 18], symbolSize: 28 }]);
});

test('buildTableChartOption：heatmap 非数值不入 data', () => {
  const option = buildTableChartOption('heatmap', {}, ['Q1', 'Q2'], [['A', 'x', '2']]);
  assert.deepEqual(option.series[0].data, [[1, 0, 2]]);
  assert.deepEqual(option.visualMap, {
    min: 2,
    max: 2,
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 0,
  });
});

test('buildTableChartOption：字符串 title 归一化为 {text}（对齐 cherry）', () => {
  const option = buildTableChartOption('line', { title: '折线图' }, ['Q1'], [['A', '1']]);
  assert.deepEqual(option.title, { text: '折线图' });
});

test('buildTableChartOption：对象 title 原样保留', () => {
  const title = { text: '折线图', left: 'center' };
  const option = buildTableChartOption('line', { title }, ['Q1'], [['A', '1']]);
  assert.deepEqual(option.title, { text: '折线图', left: 'center' });
});

test('buildTableChartOption：非数值转 null，用户 xAxis 不被覆盖', () => {
  const option = buildTableChartOption('bar', { xAxis: { type: 'value' } }, ['Q1'], [['A', 'x']]);
  assert.deepEqual(option.series[0].data, [null]);
  assert.deepEqual(option.xAxis, { type: 'value' });
});

test('buildTableChartOption：map 用省名归一化 + visualMap，默认 china', () => {
  const option = buildTableChartOption(
    'map',
    { title: '中国地图' },
    ['数值'],
    [
      ['北京', '100'],
      ['上海', '200'],
      ['广东', '300'],
    ],
  );
  assert.equal(option.series[0].type, 'map');
  assert.equal(option.series[0].map, 'china');
  assert.equal(option.series[0].roam, true);
  assert.deepEqual(option.series[0].data, [
    { name: '北京市', value: 100 },
    { name: '上海市', value: 200 },
    { name: '广东省', value: 300 },
  ]);
  assert.equal(option.visualMap.min, 100);
  assert.equal(option.visualMap.max, 300);
  assert.equal(option.__mdiMapSource, '');
});

test('buildTableChartOption：map 声明 mapDataSource 透传给组件，不泄漏到 option', () => {
  const url = 'https://geo.datav.aliyun.com/areas_v3/bound/110000_full.json';
  const option = buildTableChartOption('map', { title: '北京地图', mapDataSource: url }, ['数值'], [['海淀区', '120']]);
  assert.equal(option.__mdiMapSource, url);
  assert.equal(option.mapDataSource, undefined);
  assert.equal(option.series[0].map, url);
  assert.deepEqual(option.series[0].data, [{ name: '海淀区', value: 120 }]);
});

test('buildTableChartOption：map 用户 visualMap 不被覆盖', () => {
  const visualMap = { min: 0, max: 1000, orient: 'vertical' };
  const option = buildTableChartOption('map', { visualMap }, [], [['北京', '100']]);
  assert.deepEqual(option.visualMap, visualMap);
});

test('normalizeProvinceName：简称/全称/无匹配', () => {
  assert.equal(normalizeProvinceName('北京'), '北京市');
  assert.equal(normalizeProvinceName(' 内蒙古 '), '内蒙古自治区');
  assert.equal(normalizeProvinceName('香港'), '香港特别行政区');
  assert.equal(normalizeProvinceName('北京市'), '北京市');
  assert.equal(normalizeProvinceName('海淀区'), '海淀区');
});

test('表格转图表：:map: 声明渲染成 EChartsTableBlock type=map', async () => {
  const source = `|:map: {"title": "中国地图", "mapDataSource": "https://x/y.json"} | 数值 |
| --- | --- |
| 北京 | 100 |`;
  const { html } = await renderMarkdown(source);
  assert.match(html, /<EChartsTableBlock type="map" /);
  // options 是 JS 字面量而非 JSON，这里只校验 mapDataSource 已编码进属性
  assert.match(decodeURIComponent(/options="([^"]*)"/.exec(html)[1]), /mapDataSource/);
});
