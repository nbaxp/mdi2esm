// Mermaid 图形（移植自 mdoc）：挂载后直接替换真实 DOM；
// Vue 模板编译会丢弃 SVG 内嵌 <style>，所以不能在模板字符串里渲染
// 配色从页面 CSS 变量取值，亮/暗切换（html.dark）时重新 initialize 并重绘
const mermaidTheme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'default');
let mermaidModule;
let mermaidObserver;
let mermaidCount = 0;

async function loadMermaid() {
  mermaidModule ??= import('mermaid').catch(() => null);
  return mermaidModule;
}

const cssVar = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

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
      darkMode: mermaidTheme() === 'dark',
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

async function paintMermaid(targets, module) {
  if (targets.length === 0) return;
  const mermaid = module?.default ?? module;
  // 每次重绘都重新 initialize，避免沿用首次的主题配置
  mermaid.initialize(mermaidConfig());
  for (const target of targets) {
    const source =
      target.getAttribute('data-mermaid-source') ?? target.querySelector('.mermaid-source')?.textContent ?? '';
    try {
      await mermaid.parse(source);
      const { svg } = await mermaid.render(`md-mermaid-${(mermaidCount += 1)}`, source);
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-rendered';
      wrapper.setAttribute('data-mermaid-source', source);
      wrapper.innerHTML = svg;
      target.replaceWith(wrapper);
    } catch (err) {
      console.warn('[markdown-it] Mermaid 渲染失败，保留源码：', err);
    }
  }
}

function watchMermaidTheme(module) {
  if (mermaidObserver) return;
  let theme = mermaidTheme();
  mermaidObserver = new MutationObserver(() => {
    const next = mermaidTheme();
    if (next === theme) return;
    theme = next;
    paintMermaid([...document.querySelectorAll('.mermaid-rendered')], module).catch(() => {});
  });
  mermaidObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

// 组件挂载后调用：等两帧确保主题 CSS 变量与字体就绪，再替换源码占位
export async function mountMermaid(targets = document.querySelectorAll('.mermaid-block')) {
  const list = Array.from(targets);
  if (list.length === 0) return;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await document.fonts?.ready;

  const module = await loadMermaid();
  if (!module) {
    console.warn('[markdown-it] Mermaid 加载失败，保留源码');
    return;
  }
  watchMermaidTheme(module);
  await paintMermaid(list, module);
}
