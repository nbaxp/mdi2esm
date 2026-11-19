// Markdown 渲染管线：共享 markdown-it 实例 + 通用链接重写。
// URL 拼装与锚点形态由 config.adapters 提供，标题锚点由 markdown-it.js 里的官方 anchor 插件生成
import { maskFenceMarkers, unmaskFenceMarkers } from './code-block.js';
import { createRenderEnv, DEFAULT_ADAPTERS } from './config.js';
import md, { ensureCustomContainers, ensureSyntaxPlugins } from './markdown-it.js';
import { normalizeHash } from './markdown-plugins.js';
import { renderMath } from './math.js';

// 路径解析：'guide/./a.md' → 'guide/a.md'，处理 './' 与 '../'
export const resolvePath = (base, rel) => {
  const out = [];
  for (const part of (base + rel).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
};

// 外链图标：对齐 VitePress @mdit-vue/plugin-external-link-icon
const EXTERNAL_ICON_SVG =
  '<svg class="vp-external-link-icon" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
  'focusable="false" viewBox="0 0 100 100" ' +
  'style="display:inline-block;vertical-align:middle;width:1em;height:1em;margin-left:2px">' +
  '<path d="M18.8,85.1h56l0,0c2.2,0,4-1.8,4-4v-32h-8v28h-48v-48h28v-8h-32l0,0c-2.2,0-4,1.8-4,4v56C14.8,83.3,16.6,85.1,18.8,85.1z"></path>' +
  '<polygon points="45.7,48.7 51.3,54.3 77.2,28.5 77.2,37.2 85.2,37.2 85.2,14.9 62.8,14.9 62.8,22.9 71.5,22.9"></polygon></svg>';

// include.ts:32 的 rebase marker：被包含 .md 里的相对链接要按被包含文件的目录解析
const REBASE_RE = /^[ \t]*<!-- @include-(?:start: (.*)|end) -->[ \t]*$/gm;

// 链接重写：通用处理（外链、锚点归一化、路径解析、图片尺寸/lazy），
// URL 拼装与锚点形态交给 config.adapters，渲染层不含任何宿主路径规则
md.core.ruler.push('link_rewrite', (state) => {
  const adapters = state.env.adapters ?? DEFAULT_ADAPTERS;
  const pageDir = state.env.dir ?? '';
  const stack = [];
  let dir = pageDir;
  for (const token of state.tokens) {
    if (token.type === 'html_block' && token.content.includes('<!-- @include-')) {
      token.content = token.content.replace(REBASE_RE, (_match, start) => {
        if (start === undefined) {
          stack.pop();
          dir = stack.at(-1) ?? pageDir;
        } else {
          stack.push(start);
          dir = start;
        }
        return '';
      });
    }
    if (token.type !== 'inline') continue;
    const children = token.children ?? [];
    for (let ci = 0; ci < children.length; ci += 1) {
      const child = children[ci];
      if (child.type === 'link_open') {
        const href = child.attrGet('href') ?? '';
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          child.attrSet('target', '_blank');
          child.attrSet('rel', 'noreferrer');
          if (/^https?:/i.test(href)) {
            for (let j = ci + 1; j < children.length; j += 1) {
              if (children[j].type === 'link_close') {
                const icon = new state.Token('html_inline', '', 0);
                icon.content = EXTERNAL_ICON_SVG;
                icon.level = child.level;
                children.splice(j, 0, icon);
                break;
              }
            }
          }
          continue;
        }
        if (href.startsWith('#')) {
          const normalized = normalizeHash(href.slice(1));
          if (normalized) child.attrSet('href', normalized);
          continue;
        }
        if (href.startsWith('/')) continue;
        const [path, rawHash] = href.split('#');
        const hash = rawHash ? normalizeHash(rawHash) : '';
        child.attrSet('href', adapters.toHref({ path, resolved: resolvePath(dir, path), hash }));
      } else if (child.type === 'image') {
        let src = child.attrGet('src') ?? '';
        // 运行时解析图片尺寸语法 =WxH（对齐 VitePress image.ts，不依赖 Node 探测）
        const sizeMatch = /^([^?#]*?)=([0-9]*x?[0-9]*)$/i.exec(src);
        if (sizeMatch && sizeMatch[2] !== '') {
          const [w, h] = sizeMatch[2].split('x');
          if (w) child.attrSet('width', w);
          if (h) child.attrSet('height', h);
          src = sizeMatch[1];
          child.attrSet('src', src);
        }
        if (/^(https?:|mailto:|#|data:)/i.test(src)) continue;
        const resolved = src.startsWith('/') ? src : resolvePath(dir, src);
        child.attrSet('src', adapters.toSrc({ src, resolved }));
        child.attrSet('loading', 'lazy');
      }
    }
  }
});

// image 尺寸语法 ` =WxH` 去空格：标准 markdown-it 的 image destination 遇空格会截断，
// 无空格的 `=WxH` 才能被解析；尺寸在链接重写规则的 image 分支运行时提取
const IMAGE_SIZE_PRE = /(\]\([^\s)]*?) =([0-9]*x?[0-9]*)\)/g;

// 收集 h2–h6 并组装为「本页目录」树（与 mdoc markdown-render.js 一致）
export function buildOutline(headings) {
  const root = [];
  const stack = [];
  for (const h of headings) {
    const item = { link: `#${h.slug}`, title: h.title, children: [] };
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    if (stack.length) stack[stack.length - 1].item.children.push(item);
    else root.push(item);
    stack.push({ level: h.level, item });
  }
  return root;
}

// markdown → { html, headings }：headings 由官方 anchor 插件的 permalink 回调按出现顺序填充。
// 围栏保护与 KaTeX 渲染都在内部完成，调用方拿到的就是可挂载的最终 HTML，
// 不需要也不应该自己再拼 mask / renderMath 这两步。
export async function renderMarkdown(body, { dir = '', config } = {}) {
  const env = createRenderEnv(config, { dir });
  ensureCustomContainers(env.config);
  ensureSyntaxPlugins(env.config);
  const html = md.render(maskFenceMarkers(body).replace(IMAGE_SIZE_PRE, '$1=$2)'), env);
  return { html: await renderMath(unmaskFenceMarkers(html)), headings: env.headings };
}

// Vue 模板里合法的表达式保留插值；语法非法的 {{ ... }} 转义成字面量，
// 避免单个文档示例让整页 template 编译失败（代码块已由 v-pre 保护）
export function escapeInvalidInterpolations(html) {
  return html.replace(/{{([\s\S]*?)}}/g, (match, expression) => {
    try {
      new Function(`return (${expression});`);
      return match;
    } catch {
      return `&#123;&#123;${expression}&#125;&#125;`;
    }
  });
}
