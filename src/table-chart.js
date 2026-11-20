// 表格转图表：表格首格写 `:line:` / `:bar:` / `:pie:` 等声明（可带 `{...}` option），
// 渲染成 <EChartsTableBlock type options header rows>，图表在上、原表格保留在下。
// 语法对齐 cherry-markdown 的表格图表；option 是 JS 对象字面量（与 ```echarts 围栏一致），
// 表格数据由组件在运行时映射成 series（line/bar/pie/radar/funnel 等）。
const CHART_REGEX = /^:(\w+):(?:\s*(\{[\s\S]*\}))?$/;

// inline token → 纯文本：图表数据只要文本，markdown 强调/链接语法不参与
const inlineText = (token) =>
  (token.children ?? [])
    .map((child) => {
      if (child.type === 'softbreak' || child.type === 'hardbreak') return ' ';
      if (child.type === 'image') return child.attrGet('alt') ?? '';
      if (child.type === 'html_inline') return '';
      return child.content ?? '';
    })
    .join('');

// 表格 token 序列里定位 table_close
const tableEnd = (tokens, idx) => {
  for (let i = idx + 1; i < tokens.length; i += 1) {
    if (tokens[i].type === 'table_close') return i;
  }
  return tokens.length;
};

// 首格（第一个 inline）是否图表声明
function detectChart(tokens, idx, end) {
  for (let i = idx + 1; i < end; i += 1) {
    if (tokens[i].type !== 'inline') continue;
    const match = CHART_REGEX.exec(tokens[i].content.trim());
    return match ? { token: tokens[i], type: match[1], options: match[2] ?? '{}' } : null;
  }
  return null;
}

// 提取表头与数据行：首格是图表声明，不进表头（数据从第二格起）
function collectTable(tokens, idx, end) {
  const header = [];
  const rows = [];
  let target = null;
  let row = null;
  for (let i = idx + 1; i < end; i += 1) {
    const token = tokens[i];
    switch (token.type) {
      case 'thead_open':
        target = header;
        break;
      case 'thead_close':
      case 'tbody_close':
        target = null;
        break;
      case 'tbody_open':
        target = rows;
        break;
      case 'tr_open':
        row = [];
        break;
      case 'tr_close':
        if (row && target) target.push(row);
        row = null;
        break;
      case 'inline':
        if (!row) break;
        if (token.meta?.chart) break; // 首格是图表声明，不进表头
        row.push(inlineText(token));
        break;
      default:
        break;
    }
  }
  return { header: header[0] ?? [], rows };
}

// 包装 table_open：命中声明时前置图表组件标签，并把首格声明从表头里抹掉（原表格继续渲染）
export function applyTableChart(md) {
  const tableOpen =
    md.renderer.rules.table_open ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    const open = tableOpen(tokens, idx, options, env, self);
    const end = tableEnd(tokens, idx);
    const chart = detectChart(tokens, idx, end);
    if (!chart) return open;
    chart.token.content = '';
    chart.token.children = [];
    chart.token.meta = { ...(chart.token.meta ?? {}), chart: true };
    const { header, rows } = collectTable(tokens, idx, end);
    const attrs = [
      `type="${chart.type}"`,
      `options="${encodeURIComponent(chart.options)}"`,
      `header="${encodeURIComponent(JSON.stringify(header))}"`,
      `rows="${encodeURIComponent(JSON.stringify(rows))}"`,
    ].join(' ');
    return `<EChartsTableBlock ${attrs}></EChartsTableBlock>\n${open}`;
  };
}

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

// 表格数据 → ECharts option。约定：
// - 通用类型（line/bar/scatter…）：表头作类目轴，每行一个 series（首列是系列名）；
// - pie/funnel：两列（名称 / 数值）；
// - radar：表头作 indicator，每行一个数据系列。
// options 是用户写的字面量，仅作外层补充（title/legend/tooltip…）；series 与坐标轴由表格生成。
export function buildTableChartOption(type, options, header, rows) {
  const base = options && typeof options === 'object' && !Array.isArray(options) ? { ...options } : {};
  const names = (Array.isArray(header) ? header : []).map((value) => String(value ?? ''));
  const records = (Array.isArray(rows) ? rows : []).map((row) => (Array.isArray(row) ? row : [row]));
  const chartType = String(type || 'line');

  if (chartType === 'pie' || chartType === 'funnel') {
    base.series = [
      {
        type: chartType,
        data: records.map((row) => ({ name: String(row[0] ?? ''), value: toNumber(row[1]) ?? 0 })),
      },
    ];
    return base;
  }

  if (chartType === 'radar') {
    base.radar = base.radar ?? { indicator: names.map((name) => ({ name })) };
    base.series = [
      {
        type: 'radar',
        data: records.map((row) => ({ name: String(row[0] ?? ''), value: row.slice(1).map(toNumber) })),
      },
    ];
    return base;
  }

  if (!base.xAxis && names.length) base.xAxis = { type: 'category', data: names };
  if (!base.yAxis) base.yAxis = { type: 'value' };
  base.series = records.map((row) => ({
    name: String(row[0] ?? ''),
    type: chartType,
    data: row.slice(1).map(toNumber),
  }));
  return base;
}
