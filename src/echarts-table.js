// 表格转图表组件：由 markdown-it 的表格首格声明渲染而来（见 ./table-chart.js）。
// 与 EChartsBlock 共用 echarts.js 的 loadOption / useECharts：option 字面量求值、
// 暗色重建、resize、dispose、无 echarts 时降级为源码。
import { computed, defineComponent, ref, watch } from 'vue';

import { DEFAULT_HEIGHT, loadOption, useECharts } from './echarts.js';
import { buildTableChartOption } from './table-chart.js';

const decodeJson = (value, fallback) => {
  try {
    return JSON.parse(decodeURIComponent(value ?? '')) ?? fallback;
  } catch {
    return fallback;
  }
};

export function createEChartsTableBlock(options = {}) {
  const resolved = { height: DEFAULT_HEIGHT, ...options };

  return defineComponent({
    name: 'EChartsTableBlock',
    props: {
      type: { type: String, required: true },
      options: { type: String, default: '{}' },
      header: { type: String, default: '[]' },
      rows: { type: String, default: '[]' },
      height: { type: Number, default: null },
    },
    setup(props) {
      const el = ref(null);
      const height = computed(() => Number(props.height) || resolved.height || DEFAULT_HEIGHT);
      const { failed, source, paint } = useECharts(
        el,
        () => height.value,
        async () => {
          const raw = decodeURIComponent(props.options || '{}').trim() || '{}';
          const chartOptions = await loadOption(raw);
          return buildTableChartOption(
            props.type,
            chartOptions,
            decodeJson(props.header, []),
            decodeJson(props.rows, []),
          );
        },
        {
          sourceText: () => decodeURIComponent(props.options || '{}'),
        },
      );
      watch(
        () => [props.type, props.options, props.header, props.rows],
        () => paint(),
      );
      return { el, height, failed, source, type: props.type };
    },
    template: `
      <figure v-if="failed" class="echarts-source echarts-table-source">
        <figcaption>表格图表 {{ type }}：echarts 加载或 option 解析失败</figcaption>
        <pre><code>{{ source }}</code></pre>
        <p class="error">{{ failed.message }}</p>
      </figure>
      <div v-show="!failed" ref="el" class="echarts-rendered echarts-table-chart" :style="{ height: height + 'px' }"></div>
    `,
  });
}
