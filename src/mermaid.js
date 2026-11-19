// ```mermaid 代码块 → <MermaidBlock> 组件（fence 规则见 ./code-block.js）。
// 默认由 Pele 渲染 Mermaid 语法，也可按配置切回 Mermaid；两种驱动共用同一组件边界。
// SVG 只能经 innerHTML 写进真实 DOM——Vue 模板编译会丢掉 SVG 内嵌的 <style>。
import { h, onMounted, onUnmounted, shallowRef, watch } from 'vue';

import { lazyModule } from './lazy-module.js';

let mermaidCount = 0;

const loadMermaid = lazyModule(
  () => import('mermaid'),
  (err) => console.warn('[mdi2esm] Mermaid 模块加载失败：', err),
);
const loadPele = lazyModule(
  () => import('pele'),
  (err) => console.warn('[mdi2esm] Pele 模块加载失败：', err),
);

const isDark = () => document.documentElement.classList.contains('dark');

const cssVar = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

// Mermaid 配色从页面 CSS 变量取；Pele 直接继承 --pele-* 变量，主题切换无需重绘
function mermaidConfig() {
  const bg = cssVar('--vp-c-bg', '#ffffff');
  const bgSoft = cssVar('--vp-c-bg-soft', bg);
  const bgAlt = cssVar('--vp-c-bg-alt', bg);
  const text1 = cssVar('--vp-c-text-1', '#3c3c43');
  const text2 = cssVar('--vp-c-text-2', text1);
  const border = cssVar('--vp-c-border', text2);
  const brand = cssVar('--vp-c-brand-1', text2);
  return {
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      darkMode: isDark(),
      background: bg,
      primaryColor: bgSoft,
      primaryTextColor: text1,
      primaryBorderColor: brand,
      secondaryColor: bgAlt,
      secondaryTextColor: text1,
      secondaryBorderColor: border,
      tertiaryColor: bg,
      tertiaryTextColor: text1,
      tertiaryBorderColor: border,
      mainBkg: bgSoft,
      nodeBorder: brand,
      nodeTextColor: text1,
      textColor: text1,
      lineColor: text2,
      edgeLabelBackground: bg,
      clusterBkg: bgSoft,
      clusterBorder: border,
      titleColor: text1,
      fontFamily: getComputedStyle(document.body).fontFamily || 'inherit',
    },
  };
}

export function createMermaidBlock(driver = 'pele') {
  return {
    name: 'MermaidBlock',
    props: {
      // fence 里 encodeURIComponent 过，避免引号、换行把模板属性搞坏
      graph: { type: String, required: true },
    },
    setup(props) {
      const source = () => decodeURIComponent(props.graph);
      const svg = shallowRef('');
      const id = `md-mermaid-${(mermaidCount += 1)}`;
      let theme = '';
      let observer;
      let seq = 0;

      async function paint() {
        const current = ++seq;
        // 两种驱动都需要等字体就绪，否则文本测量会偏
        await document.fonts?.ready;
        if (current !== seq) return;

        if (driver !== 'mermaid') {
          const module = await loadPele();
          if (current !== seq || !module) return;
          try {
            const { svg: next } = module.render(source());
            if (current === seq) svg.value = next;
          } catch (err) {
            console.warn('[mdi2esm] Pele 渲染失败，保留源码：', err);
          }
          return;
        }

        const module = await loadMermaid();
        if (current !== seq || !module) return;
        const mermaid = module.default ?? module;
        theme = isDark() ? 'dark' : 'default';
        mermaid.initialize(mermaidConfig());
        try {
          await mermaid.parse(source());
          const { svg: next } = await mermaid.render(id, source());
          if (current === seq) svg.value = next;
        } catch (err) {
          console.warn('[mdi2esm] Mermaid 渲染失败，保留源码：', err);
        }
      }

      onMounted(() => {
        if (driver === 'mermaid') {
          // Mermaid 主题切换（html.dark）需要重绘；Pele 由 CSS 变量直接换色
          observer = new MutationObserver(() => {
            if ((isDark() ? 'dark' : 'default') === theme) return;
            paint();
          });
          observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        }
        paint();
      });

      onUnmounted(() => observer?.disconnect());

      // 同一位置被复用时 graph 会变，要重画
      watch(() => props.graph, paint);

      // 渲染出来之前（以及失败时）显示源码，不留空白
      return () =>
        svg.value
          ? h('div', { class: 'mermaid-rendered', innerHTML: svg.value })
          : h('pre', { class: 'mermaid-source' }, source());
    },
  };
}
