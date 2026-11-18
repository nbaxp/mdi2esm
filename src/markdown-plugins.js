// 移植自 mdoc 的 VitePress 官方纯 markdown-it 规则。
// 不依赖 Node fs / MarkdownItAsync，可在浏览器端同步渲染链路里直接使用。
// 原版：https://github.com/vuejs/vitepress/tree/v2.0.0-alpha.21/src/node/markdown/plugins
import { slugify } from '@mdit-vue/shared';

// 官方 src/shared/shared.ts:390-396：只转义裸 &，保留 &copy; 之类实体交给 Vue 编译器解码
export const escapeHtml = (str) =>
  str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/&(?![\w#]+;)/g, '&amp;');

function contentOf(token) {
  if (token.info === 'entity') return token.markup;
  if (token.info === 'escape' && token.content === '&') return '&amp;';
  return token.content;
}

// 官方 restoreEntities.ts：Vue 模板编译会再解一次实体，正文文本需保留原样
export function applyRestoreEntities(md) {
  md.core.ruler.at('text_join', (state) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline') continue;
      const tokens = block.children ?? [];
      for (const token of tokens) {
        if (token.type === 'text_special') token.type = 'text';
      }
      let last = 0;
      for (let curr = 0; curr < tokens.length; curr += 1) {
        if (tokens[curr].type === 'text' && curr + 1 < tokens.length && tokens[curr + 1].type === 'text') {
          tokens[curr + 1].content = contentOf(tokens[curr]) + contentOf(tokens[curr + 1]);
          tokens[curr + 1].info = '';
          tokens[curr + 1].markup = '';
        } else {
          if (curr !== last) tokens[last] = tokens[curr];
          last += 1;
        }
      }
      tokens.length = last;
    }
  });
  md.renderer.rules.text = (tokens, idx) => escapeHtml(tokens[idx].content);
}

// 官方 table.ts：横向溢出的表格可被键盘聚焦并滚动
export function applyTablePlugin(md) {
  const tableOpen = md.renderer.rules.table_open;
  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    if (tokens[idx].attrIndex('tabindex') < 0) tokens[idx].attrSet('tabindex', '0');
    return tableOpen ? tableOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
}

// 官方 link.ts:151-153：链接里的 #中文 标题 按与 anchor 相同的 slugify 归一化
export const normalizeHash = (hash) => (hash ? `#${slugify(decodeURI(hash))}` : '');

// 官方 highlight.ts:105-111：剥出 fence info 里语言之后的元信息，交给 Prism 行标记
export const fenceMetaAttrs = (info) => {
  const match = /^[a-zA-Z0-9-_]+/.exec(info);
  return match
    ? info
        .slice(match[0].length)
        .replace(/(?<!=)\{/g, ' {')
        .trim()
        .replace(/\s+/g, ' ')
    : '';
};

// 官方 extractLang：fence / code-group 的 info 首段是语言名，
// `js-vue`→`js`、`vue-html`→`template`、`ansi`→空。code-group 取 tab 标题与
// fence 外壳都要用同一套归一化，所以只留这一份实现
export const extractLang = (info) =>
  /^[a-zA-Z0-9-_]+/
    .exec(info ?? '')?.[0]
    .replace(/-vue$/, '')
    .replace(/^vue-html$/, 'template')
    .replace(/^ansi$/, '') || '';

// 官方 lineNumbers.ts：依赖 code-block.js 的 preWrapper，必须在其后注册。
// enable 为显式覆盖（供独立实例测试）；不传时逐次从 env.config.markdown.lineNumbers 读取
export function applyLineNumbers(md, enable) {
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const rawCode = fence(tokens, idx, options, env, self);
    const info = tokens[idx].info;
    const global = enable ?? env?.config?.markdown?.lineNumbers ?? false;
    if ((!global && !/:line-numbers\b/.test(info)) || (global && /:no-line-numbers\b/.test(info))) {
      return rawCode;
    }
    const start = Number(/=(\d+)/.exec(info)?.[1] ?? 1);
    // preWrapper 输出的是 <code class="language-xx">，不能按字面量 '<code>' 定位
    const code = rawCode.slice(rawCode.indexOf('<code'), rawCode.indexOf('</code>'));
    const lines = code.split('\n');
    // markdown-it 的 fence 内容以换行结尾，末项不算代码行
    if (lines.length > 1 && lines.at(-1) === '') lines.pop();
    const numbers = lines.map((_, index) => `<span class="line-number">${index + start}</span><br>`).join('');
    const wrapper = `<div class="line-numbers-wrapper" aria-hidden="true">${numbers}</div>`;
    return rawCode.replace(/<\/div>\s*$/, `${wrapper}</div>`).replace(/"(language-[^"]*?)"/, '"$1 line-numbers-mode"');
  };
}

// 锚点 href 生成完整同页路径（根绝对），规避 <base> 把纯 #锚点 解析到部署根。
// Node 测试环境无 location，回退纯锚点保持既有断言。
export function anchorHref(id) {
  if (typeof location === 'undefined') return `#${id}`;
  return `${location.pathname}${location.search}#${id}`;
}
