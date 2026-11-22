// 表格转图表组件：由 markdown-it 的表格首格声明渲染而来（见 ./table-chart.js）。
// 与 EChartsBlock 共用 echarts.js 的 loadOption / useECharts：option 字面量求值、
// 暗色重建、resize、dispose、无 echarts 时降级为源码。
// 地图类型额外在 prepare 钩子里 fetch GeoJSON → registerMap，带加载/失败/重试三态
// （对齐 cherry-markdown 的 MapChartOptionsHandler）。
import { computed, defineComponent, ref, watch } from 'vue';

import { DEFAULT_HEIGHT, loadOption, useECharts } from './echarts.js';
import { buildTableChartOption } from './table-chart.js';
import { defaultFetcher, isExternal, resolvePath } from './url.js';

const decodeJson = (value, fallback) => {
  try {
    return JSON.parse(decodeURIComponent(value ?? '')) ?? fallback;
  } catch {
    return fallback;
  }
};

// 默认 GeoJSON 数据源：与 cherry-markdown 一致（阿里云 DataV 全国边界）
const DEFAULT_MAP_SOURCE = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';
const LOCAL_MAP_SOURCE = './assets/data/china.json';

const mapLoadingOption = (title) => ({
  title: {
    text: `${title?.text ?? '地图'}：地图数据加载中…`,
    left: 'center',
    top: '40%',
    textStyle: { fontSize: 16 },
  },
});

const mapFailureOption = (title, retry) => ({
  title: {
    text: `${title?.text ?? '地图'}：地图数据加载失败`,
    subtext: '请检查网络或 mapDataSource 配置后重试',
    left: 'center',
    top: '40%',
  },
  graphic: [
    {
      type: 'text',
      left: 'center',
      top: '60%',
      style: { text: '点击重试', fill: '#409eff', fontSize: 14, cursor: 'pointer' },
      onclick: retry,
    },
  ],
});

// 数据源优先级：声明 mapDataSource > 全局 config.echarts.mapTable.sourceUrl > 阿里云默认 > 本地兜底
function mapSources(declared, configured) {
  const sources = [];
  if (declared && !sources.includes(declared)) sources.push(declared);
  if (configured && !sources.includes(configured)) sources.push(configured);
  for (const url of [DEFAULT_MAP_SOURCE, LOCAL_MAP_SOURCE]) {
    if (!sources.includes(url)) sources.push(url);
  }
  return sources;
}

export function createEChartsTableBlock(options = {}) {
  const resolved = { height: DEFAULT_HEIGHT, ...options };
  const adapters = options.adapters ?? {};
  const fetcher = adapters.fetcher ?? defaultFetcher;
  const resolveResource = adapters.resolveResource ?? (({ file, spec }) => (isExternal(spec) ? spec : file));

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

      async function prepareMap({ echarts, option, chart, stale }) {
        const declared = option.__mdiMapSource;
        delete option.__mdiMapSource;
        const sources = mapSources(declared, resolved.mapTable?.sourceUrl).map((spec) =>
          resolveResource({ file: resolvePath('', spec), spec, kind: 'map' }),
        );
        const useSource = (source) => {
          if (source)
            option.series?.forEach((series) => {
              if (series.type === 'map') series.map = source;
            });
          chart.setOption(option, true);
        };

        // 已注册则直接用（主题切换/重试重绘都走这条路）
        const registered = sources.find((source) => echarts.getMap?.(source));
        if (registered) {
          useSource(registered);
          return;
        }

        chart.setOption(mapLoadingOption(option.title), true);
        for (const url of sources) {
          try {
            const response = await fetcher(url, { referrerPolicy: 'no-referrer' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const geoJson = await response.json();
            if (stale()) return;
            echarts.registerMap(url, geoJson);
            useSource(url);
            return;
          } catch (err) {
            console.warn(`[mdi2esm] 地图数据加载失败（${url}）：`, err instanceof Error ? err.message : String(err));
          }
        }
        if (stale()) return;
        chart.setOption(
          mapFailureOption(option.title, () => paint()),
          true,
        );
      }

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
          // 非地图类型仍由 prepare 完成 setOption（useECharts 把最终绘制交给钩子）
          prepare: async (ctx) => {
            if (props.type === 'map') await prepareMap(ctx);
            else ctx.chart.setOption(ctx.option);
          },
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
