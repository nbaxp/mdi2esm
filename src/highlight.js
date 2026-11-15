// Shiki 高亮（移植自 mdoc）：markdown-it 的 highlight 是同步的，渲染后按 DOM 异步替换
// 主题对齐 VitePress 默认双主题（github-light / github-dark），跟随 html.dark 切换
import {
  transformerMetaHighlight,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers';

import { fenceMetaAttrs } from './markdown-plugins.js';

const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' };
// 对齐 VitePress：defaultColor=false 只输出 --shiki-light/--shiki-dark，交给官方 CSS 按 html.dark 切换
const SHIKI_OPTIONS = {
  themes: SHIKI_THEMES,
  defaultColor: false,
  colorReplacements: {
    'github-light': {
      '#959da5': '#6c676f',
      '#28a745': '#0e790b',
      '#b08800': '#846312',
      '#e36209': '#c13617',
      '#3192aa': '#05728b',
      '#d73a49': '#c62739',
      '#22863a': '#11782a',
      '#6a737d': '#62687b',
      '#1b7c83': '#06747a',
      '#0366d6': '#0663d0',
      '#cb2431': '#c82430',
    },
    'github-dark': {
      '#586069': '#5b93a3',
      '#6a737d': '#818e99',
      '#ea4a5a': '#ef5564',
      '#2188ff': '#268bf9',
    },
  },
};

// 官方 highlight.ts:81-97, 161-193 的 transformer 组合
const TRANSFORMERS = [
  transformerMetaHighlight(),
  transformerNotationDiff(),
  transformerNotationFocus({ classActiveLine: 'has-focus', classActivePre: 'has-focused-lines' }),
  transformerNotationHighlight(),
  transformerNotationErrorLevel(),
  {
    name: 'vitepress:add-dir',
    pre(node) {
      node.properties.dir = 'ltr';
    },
  },
  {
    name: 'vitepress:v-pre',
    pre(node) {
      node.properties['v-pre'] = '';
    },
  },
  {
    name: 'vitepress:empty-line',
    code(hast) {
      for (const span of hast.children) {
        if (
          span.type === 'element' &&
          span.tagName === 'span' &&
          Array.isArray(span.properties.class) &&
          span.properties.class.includes('line') &&
          span.children.length === 0
        ) {
          span.children.push({ type: 'element', tagName: 'wbr', properties: {}, children: [] });
        }
      }
    },
  },
];
let shikiModule;

async function loadShiki() {
  shikiModule ??= import('./shiki-setup.js').catch(() => null);
  return shikiModule;
}

export async function highlightCodeBlocks(html) {
  if (!html.includes('class="language-')) return html;
  const container = document.createElement('div');
  container.innerHTML = html;
  const targets = Array.from(container.querySelectorAll('div[class*="language-"][dir="ltr"]'))
    .map((wrapper) => ({ wrapper, pre: wrapper.querySelector(':scope > pre') }))
    .filter(({ pre }) => pre);
  if (targets.length === 0) return html;

  const shiki = await loadShiki();
  const codeToHtml = shiki?.codeToHtml ?? shiki?.default?.codeToHtml;
  if (!codeToHtml) return html;

  await Promise.all(
    targets.map(async ({ wrapper, pre }) => {
      const lang = (/language-([\w-]+)/.exec(wrapper.className)?.[1] ?? '').toLowerCase();
      if (!lang) return;
      try {
        // 官方 highlight.ts:105-111：语言之后的元信息（{1,3}、:line-numbers）作为 meta.__raw
        const out = await codeToHtml(pre.textContent, {
          lang,
          meta: { __raw: fenceMetaAttrs(wrapper.dataset.meta ?? '') },
          transformers: TRANSFORMERS,
          ...SHIKI_OPTIONS,
        });
        const template = document.createElement('template');
        template.innerHTML = out;
        const next = template.content.firstElementChild;
        if (!next) return;
        pre.replaceWith(next);
      } catch {
        // 未注册的语言或引擎异常：保留 markdown-it 输出的转义纯文本
      }
    }),
  );

  return container.innerHTML;
}
