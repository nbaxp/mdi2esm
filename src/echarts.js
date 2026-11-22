// ECharts 运行时：option 求值（Blob URL 动态 import）+ 实例管理（init / resize / dispose）。
// echarts 是可选 peer：没装或加载失败时降级为源码展示，不留空白。
// 页面上的图表实例会跟随 html.dark 自动重建，主题切换不残留旧配色。
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { lazyModule } from './lazy-module.js';

export const DEFAULT_HEIGHT = 400;

// echarts 是可选 peer：模块级缓存，加载失败恒为 null，由调用方降级为源码展示
const loadEcharts = lazyModule(
  () => import('echarts'),
  (err) => console.warn('[mdi2esm] ECharts 模块加载失败：', err),
);

// option 是 JS 对象字面量（可含函数），不是 JSON：包成 `export default (...)` 交给 Blob URL 求值。
// 这与 markdown-script.js 的 importModuleSource 同一机制，末尾分号已在上游剥掉。
export async function loadOption(code) {
  const source = `export default (${code});`;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return (await import(/* @vite-ignore */ url)).default;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 图表实例的通用生命周期：load echarts → init → setOption，跟随暗色主题重建、
// 容器尺寸变化 resize、卸载 dispose。el 是组件模板里的容器 ref；
// getOption 返回完整 option；sourceText 是降级时展示的源码。
// prepare 可选：拿到 echarts 实例与刚 init 的 chart 后、setOption 前的异步钩子
// （地图用它 fetch GeoJSON → registerMap，并按加载/失败态直接 setOption）。
// 返回 { failed, source, paint }：paint 供 option 变化时重绘。
export function useECharts(el, height, getOption, { sourceText, prepare } = {}) {
  const failed = ref(null);
  const source = ref('');
  const chart = shallowRef(null);
  const seq = { n: 0 };
  let echarts = null;
  let observer = null;
  let resizeObserver = null;
  let themeClass = null;

  async function paint() {
    const element = el.value;
    if (!element) return;
    const current = ++seq.n;
    try {
      echarts ??= await loadEcharts();
      const option = await getOption();
      if (current !== seq.n) return;
      if (!option || typeof option !== 'object') throw new Error('empty option');
      chart.value?.dispose();
      chart.value = echarts.init(element, themeClass);
      if (prepare) {
        // prepare 负责最终 setOption（地图要先 fetch + registerMap，再画完整 option 或状态页）
        await prepare({ echarts, option, chart: chart.value, stale: () => current !== seq.n });
      } else {
        chart.value.setOption(option);
      }
      failed.value = null;
      source.value = '';
    } catch (err) {
      if (current !== seq.n) return;
      failed.value = err instanceof Error ? err : new Error(String(err));
      source.value = sourceText ? sourceText() : '';
      chart.value?.dispose();
      chart.value = null;
    }
  }

  function startObservers() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(() => {
      const cls = document.documentElement.classList;
      const next = cls.contains('dark') ? 'dark' : null;
      if (next === themeClass) return;
      themeClass = next;
      // 主题变化后重建实例：echarts 不会自动跟随外层 class 换色
      paint();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    themeClass = document.documentElement.classList.contains('dark') ? 'dark' : null;

    if (resizeObserver || typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver(() => chart.value?.resize());
    resizeObserver.observe(el.value);
  }

  function stopObservers() {
    observer?.disconnect();
    observer = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
  }

  onMounted(() => {
    startObservers();
    paint();
  });
  onBeforeUnmount(stopObservers);
  watch(height, () => chart.value?.resize());

  return { failed, source, paint };
}

// 由 config.echarts 造出 ```echarts 代码块对应的组件
export function createEChartsBlock(options = {}) {
  const resolved = { height: DEFAULT_HEIGHT, ...options };

  return defineComponent({
    name: 'EChartsBlock',
    props: {
      code: { type: String, required: true },
      height: { type: Number, default: null },
    },
    setup(props) {
      const el = ref(null);
      const height = computed(() => Number(props.height) || resolved.height || DEFAULT_HEIGHT);
      const { failed, source, paint } = useECharts(
        el,
        () => height.value,
        async () => {
          const raw = decodeURIComponent(props.code)
            .trim()
            .replace(/;+\s*$/, '');
          if (!raw) throw new Error('empty');
          return loadOption(raw);
        },
        { sourceText: () => decodeURIComponent(props.code) },
      );
      watch(
        () => props.code,
        () => paint(),
      );
      return { el, height, failed, source };
    },
    // 失败时展示原始源码 + 错误信息，便于排查；成功时隐藏容器由 echarts 接管
    template: `
      <figure v-if="failed" class="echarts-source">
        <figcaption>ECharts option 加载或解析失败</figcaption>
        <pre><code>{{ source }}</code></pre>
        <p class="error">{{ failed.message }}</p>
      </figure>
      <div v-show="!failed" ref="el" class="echarts-rendered" :style="{ height: height + 'px' }"></div>
    `,
  });
}
