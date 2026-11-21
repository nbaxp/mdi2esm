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
  // 对齐 cherry 的 TitleOptionsHandler：声明里的 title 是字符串（如 {"title":"折线图"}），
  // ECharts 6 要求 title 为对象，直接透传字符串会在 setOption 抛错。这里归一化成 {text}。
  if (typeof base.title === 'string') {
    base.title = { text: base.title.replace(/\s*,\s*$/, '') };
  }
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

  // 以下三类对齐 cherry-markdown 的列约定（见 cherry-table-echarts-plugin.js）
  if (chartType === 'heatmap') {
    const yData = records.map((row) => String(row[0] ?? ''));
    const data = [];
    records.forEach((row, yIndex) => {
      row.slice(1).forEach((value, xIndex) => {
        const num = toNumber(value);
        if (num != null) data.push([xIndex, yIndex, num]);
      });
    });
    const nums = data.map((item) => item[2]);
    base.xAxis = base.xAxis ?? { type: 'category', data: names };
    base.yAxis = base.yAxis ?? { type: 'category', data: yData };
    base.visualMap = base.visualMap ?? {
      min: nums.length ? Math.min(...nums) : 0,
      max: nums.length ? Math.max(...nums) : 0,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
    };
    base.tooltip = base.tooltip ?? {
      formatter: (params) => `${yData[params.data[1]]}<br/>${names[params.data[0]]}: ${params.data[2]}`,
    };
    base.series = [{ type: 'heatmap', data, label: { show: true } }];
    return base;
  }

  if (chartType === 'sankey') {
    const links = [];
    const nodes = new Set();
    records.forEach((row) => {
      const source = String(row[0] ?? '').trim();
      const target = String(row[1] ?? '').trim();
      const value = toNumber(row[2]);
      if (source && target && value != null && value > 0) {
        links.push({ source, target, value });
        nodes.add(source);
        nodes.add(target);
      }
    });
    base.tooltip = base.tooltip ?? { trigger: 'item' };
    base.series = [
      {
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        orient: 'horizontal',
        data: Array.from(nodes).map((name) => ({ name })),
        links,
        lineStyle: { color: 'source', curveness: 0.5 },
      },
    ];
    return base;
  }

  if (chartType === 'scatter') {
    const mapping = base['cherry:mapping'];
    if (mapping !== undefined) delete base['cherry:mapping'];
    // 图表声明占据表头首格，而数据行首格是点名。collectTable 抹掉声明格后，
    // 官方示例的表头通常没有独立的"名称"列头，导致 names 比数据行少一列，
    // names[i] 实际对应 row[i+1]。补一个占位列头使其与数据行同构，避免整体错位。
    const firstRow = records.find((row) => row.length > 0);
    const colNames = firstRow && names.length === firstRow.length - 1 ? ['', ...names] : names;
    const colIndex = (column) => {
      const i = colNames.indexOf(String(column ?? '').trim());
      return i >= 0 ? i : null;
    };
    const keywordIndex = (keys) => {
      const i = colNames.findIndex((h) => keys.some((k) => String(h).toLowerCase().includes(k)));
      return i >= 0 ? i : null;
    };
    let xCol;
    let yCol;
    let sizeCol = null;
    let groupCol = null;
    if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
      xCol = colIndex(mapping.x);
      yCol = colIndex(mapping.y);
      if (xCol == null || yCol == null) {
        // 对齐 cherry：记录错误并返回空 series（不中断渲染）
        console.warn(`[table-chart] scatter 缺少必需列（x/y）：${colNames.join(' | ')}`);
        return { series: [] };
      }
      sizeCol = colIndex(mapping.size);
      groupCol = colIndex(mapping.group ?? mapping.series);
    } else {
      xCol = keywordIndex(['x', '横坐标']) ?? 1;
      yCol = keywordIndex(['y', '纵坐标']) ?? 2;
      sizeCol = keywordIndex(['size', '大小']);
      groupCol = keywordIndex(['series', 'group', '分组', '系列']);
    }
    const sizes = records.map((row) => toNumber(row[sizeCol])).filter((v) => v != null);
    const minSize = sizes.length ? Math.min(...sizes) : 0;
    const maxSize = sizes.length ? Math.max(...sizes) : 0;
    const points = records.map((row) => ({
      name: String(row[0] ?? ''),
      x: toNumber(row[xCol]),
      y: toNumber(row[yCol]),
      size: sizeCol != null ? toNumber(row[sizeCol]) : null,
      group: groupCol != null ? String(row[groupCol] ?? '').trim() || '系列1' : null,
    }));
    const groups = groupCol != null ? Array.from(new Set(points.map((p) => p.group))) : [null];
    base.xAxis = base.xAxis ?? { type: 'value' };
    base.yAxis = base.yAxis ?? { type: 'value' };
    base.series = groups.map((group) => ({
      name: group ?? undefined,
      type: 'scatter',
      data: points
        .filter((p) => (groupCol != null ? p.group === group : true))
        .map((p) => {
          const item = { name: p.name, value: [p.x, p.y] };
          item.symbolSize =
            p.size == null
              ? 10
              : maxSize === minSize
                ? 12
                : Math.round(6 + ((p.size - minSize) / (maxSize - minSize)) * (28 - 6));
          return item;
        }),
    }));
    return base;
  }

  if (chartType === 'radar') {
    base.radar = base.radar ?? {};
    base.radar.indicator = names.map((name, i) => {
      const values = records.map((row) => toNumber(row[i + 1])).filter((v) => v != null);
      if (!values.length) return { name };
      return { name, max: Math.ceil(Math.max(...values) * 1.2) };
    });
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
