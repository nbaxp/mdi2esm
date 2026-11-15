// KaTeX 公式渲染（移植自 mdoc）：入口只产出占位标记，这里按需加载并替换
// katex 与其 CSS 由 importmap / 调用方提供；CSS 路径由 config.adapters.katexCss 决定
import { DEFAULT_ADAPTERS } from './config.js';

let katexModule;

async function loadKatex() {
  katexModule ??= import('katex').catch(() => null);
  return katexModule;
}

function ensureKatexCss(href) {
  if (!href) return;
  if (document.head.querySelector('link[data-md-katex]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-md-katex', '');
  document.head.append(link);
}

export async function renderMath(html, config) {
  if (!html.includes('class="md-math-placeholder"')) return html;
  const adapters = config?.adapters ?? DEFAULT_ADAPTERS;
  ensureKatexCss(adapters.katexCss?.(config));
  const container = document.createElement('div');
  container.innerHTML = html;
  const targets = Array.from(container.querySelectorAll('.md-math-placeholder'));

  const katex = await loadKatex();
  const renderToString = katex?.renderToString ?? katex?.default?.renderToString;
  if (!renderToString) {
    console.warn('[markdown-it] KaTeX 加载失败，公式按原始文本渲染');
    for (const element of targets) element.replaceWith(document.createTextNode(element.dataset.tex ?? ''));
    return container.innerHTML;
  }

  for (const element of targets) {
    const display = element.dataset.display === 'true';
    const tex = element.dataset.tex ?? '';
    let out;
    try {
      out = renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore' });
    } catch (err) {
      console.warn('[markdown-it] KaTeX 渲染失败：', tex, err);
      const fallback = document.createElement('span');
      fallback.className = 'katex-error';
      fallback.textContent = tex;
      element.replaceWith(fallback);
      continue;
    }
    if (out.includes('katex-error')) console.warn('[markdown-it] KaTeX 解析失败：', tex);
    const holder = document.createElement('div');
    holder.innerHTML = out;
    const first = holder.firstElementChild;
    if (!first) {
      element.replaceWith(document.createTextNode(tex));
    } else if (display && first.classList.contains('katex-display')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'katex-display';
      wrapper.append(...first.childNodes);
      element.replaceWith(wrapper);
    } else {
      element.replaceWith(first);
    }
  }
  return container.innerHTML;
}
