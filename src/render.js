// Markdown 渲染管线：共享 markdown-it 实例 + 通用链接重写。
// URL 拼装与锚点形态由 config.adapters 提供，标题锚点由 markdown-it.js 里的官方 anchor 插件生成
import { maskFenceMarkers, unmaskFenceMarkers } from './code-block.js';
import { assertConfigCompatible, createRenderEnv, DEFAULT_ADAPTERS } from './config.js';
import md, { ensureCustomContainers, ensureSyntaxPlugins } from './markdown-it.js';
import { normalizeHash } from './markdown-plugins.js';
import { renderMath } from './math.js';
import { isExternal, resolvePath } from './url.js';

// 路径解析实现已收敛到 url.js，这里保留 re-export 兼容现有调用方
export { resolvePath };

// include.ts:32 的 rebase marker：被包含 .md 里的相对链接要按被包含文件的目录解析
const REBASE_RE = /^[ \t]*<!-- @include-(?:start: (.*)|end) -->[ \t]*$/gm;

// 链接重写：通用处理（外链、锚点归一化、路径解析、图片尺寸/lazy），
// URL 拼装与锚点形态交给 config.adapters，渲染层不含任何宿主路径规则
md.core.ruler.push('link_rewrite', (state) => {
  const adapters = state.env.adapters ?? DEFAULT_ADAPTERS;
  // 图片懒加载对齐 VitePress：默认禁用，仅 markdown.image.lazyLoad 为 true 时给相对路径图片加
  const lazyLoad = state.env.config?.markdown?.image?.lazyLoad === true;
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
          // 外链图标交给 CSS 层（官方 .external-link-icon-enabled + ::after，默认关闭），
          // 渲染层不注入图标 DOM，与 VitePress 默认行为一致。
          continue;
        }
        if (href.startsWith('#')) {
          const normalized = normalizeHash(href.slice(1));
          if (normalized) child.attrSet('href', normalized);
          continue;
        }
        // data: / 协议相对 / 其他 scheme 一律原样，不交给宿主适配器
        if (isExternal(href)) continue;
        // 根绝对路径同样经 toHref，让宿主决定 base / 路由映射（例如 mdoc 的 /public 改写）
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
        if (isExternal(src) || src.startsWith('#')) continue;
        const resolved = src.startsWith('/') ? src : resolvePath(dir, src);
        child.attrSet('src', adapters.toSrc({ src, resolved }));
        if (lazyLoad) child.attrSet('loading', 'lazy');
      } else if (child.type === 'media') {
        let src = child.attrGet('src') ?? '';
        // 与图片同策略：协议 URL / data 原样，相对路径按 dir 解析后走 toSrc
        if (isExternal(src) || src.startsWith('#')) continue;
        const resolved = src.startsWith('/') ? src : resolvePath(dir, src);
        child.attrSet('src', adapters.toSrc({ src, resolved }));
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
export async function renderMarkdown(body, { dir = '', config, lineMap } = {}) {
  assertConfigCompatible(config);
  const env = createRenderEnv(config, { dir });
  // lineMap：body 每行对应的原文行号（1-based），供 headings.line 还原
  if (lineMap) env.lineMap = lineMap;
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
