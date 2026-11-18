// Markdown → 渲染实例装配（移植自 mdoc，原 npm2esm entries/markdown-it 迁入应用侧）
// 依赖包由 npm2esm 各自构建、经 importmap 解析，在此完成实例装配
import { anchor } from '@mdit/plugin-anchor';
import { attrs } from '@mdit/plugin-attrs';
import { container } from '@mdit/plugin-container';
import { footnote } from '@mdit/plugin-footnote';
import { mark } from '@mdit/plugin-mark';
import { sub } from '@mdit/plugin-sub';
import { sup } from '@mdit/plugin-sup';
import { tasklist } from '@mdit/plugin-tasklist';
import { tocPlugin } from '@mdit-vue/plugin-toc';
import { slugify } from '@mdit-vue/shared';
import MarkdownIt from 'markdown-it';
import cjkFriendly from 'markdown-it-cjk-friendly';

import { applyCodeBlock } from './code-block.js';
import { CONTAINER_LABELS, DEFAULT_ADAPTERS } from './config.js';
import { applyRestoreEntities, applyTablePlugin, extractLang } from './markdown-plugins.js';

const md = new MarkdownIt({ html: true, linkify: true });
// 对齐 mdoc / VitePress：只认显式协议链接，裸域名不自动成链
md.linkify.set({ fuzzyLink: false });

// 移植自 mdoc：VitePress 官方纯规则（实体还原、表格可聚焦），须在插件注册前挂接
applyRestoreEntities(md);
applyTablePlugin(md);

// 官方 markdown.ts:458-524 的社区插件顺序；fence 不进 attrs，
// 让 {1,3} / :line-numbers 等元信息原样交给 Prism 行标记与行号插件
md.use(attrs, {
  rule: ['inline', 'table', 'list', 'heading', 'hr', 'softbreak', 'blockInfo', 'blockEnd', 'tasklist'],
});
md.use(tasklist);
md.use(footnote);
md.use(mark);
md.use(sub);
md.use(sup);
md.use(cjkFriendly);

// 行内图标短码：`:i-集合-图标:` 翻成 <Icon>，组件由宿主注入——包内不持有组件、不内置图标集。
// emoji 不在这里处理：交给 markdown-it-emoji（见 ensureEmojiPlugin），没装时 `:名字:` 保持原文。
const ICON_SHORTCODE_RE = /^:i-([a-z0-9]+)-([a-z0-9-]+):/;

md.inline.ruler.after('escape', 'icon_shortcode', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x3a /* : */) return false;
  const match = ICON_SHORTCODE_RE.exec(state.src.slice(state.pos, state.posMax));
  if (!match) return false;
  if (!silent) {
    const token = state.push('icon_shortcode', '', 0);
    // 短码用连字符分段，Iconify 的图标名用冒号分段
    token.content = `${match[1]}:${match[2]}`;
  }
  state.pos += match[0].length;
  return true;
});

// 属性值只可能含 [a-z0-9:+_-]，无需再转义；标签由 Vue 模板编译成宿主注入的组件
md.renderer.rules.icon_shortcode = (tokens, idx) => `<Icon icon="${tokens[idx].content}" />`;

// emoji：用 markdown-it-emoji（不内置）——宿主提供了就启用（full 数据，GitHub / VitePress 同套），
// 没装时动态 import 失败，静默回退，`:名字:` 按普通文本原样保留。
// 插件挂载是异步的：管线的 createMarkdownComponent 会在首次渲染前 await（见 pipeline.js），
// 直接用 renderMarkdown / render 的调用点在插件就绪前渲染到的是原文，之后的渲染自动带上 emoji。
let emojiReady;
export function ensureEmojiPlugin() {
  emojiReady ??= import('markdown-it-emoji').then((emoji) => md.use(emoji.full)).catch(() => {});
  return emojiReady;
}

// 标题锚点：permalink 对齐官方 .header-anchor 与 aria-label，顺带收集 h2/h3 供目录
md.use(anchor, {
  slugify,
  tabIndex: false,
  getTokensText: (tokens) =>
    tokens
      .filter((token) => !['html_inline', 'icon_shortcode'].includes(token.type))
      .map((token) => token.content)
      .join(''),
  permalink: (slug, _options, state, idx) => {
    const children = state.tokens[idx + 1].children ?? [];
    // restoreEntities 把裸 & 留成 &amp;，与官方 toc.format 一样还原后再用于 aria-label / 目录标题
    const title = children
      .filter((token) => token.type === 'text' || token.type === 'code_inline')
      .map((token) => token.content)
      .join('')
      .replaceAll('&amp;', '&')
      // 标题里夹了组件/短码时，两侧文本各自带空格，合并成单个空格
      .replace(/\s+/g, ' ')
      .trim();
    const level = Number(state.tokens[idx].tag.slice(1));
    // 收集 h2-h6（h1 为页面标题不进目录）；AppToc 暂仍从渲染后 DOM 收集
    if (level >= 2) state.env.headings?.push({ level, title, slug });
    children.push(
      Object.assign(new state.Token('text', '', 0), { content: ' ' }),
      Object.assign(new state.Token('link_open', 'a', 1), {
        attrs: [
          ['class', 'header-anchor'],
          ['href', (state.env.adapters ?? DEFAULT_ADAPTERS).anchorHref(slug)],
          ['aria-label', `Permalink to “${title}”`],
        ],
      }),
      new state.Token('link_close', 'a', -1),
    );
  },
});

// [[toc]]：与 anchor 共用 slugify，format 还原 restoreEntities 保留的 &amp;
md.use(tocPlugin, {
  slugify,
  format: (title) => title.replaceAll('&amp;', '&'),
});

// 容器名与 VitePress 官方 locales[].container 的键对齐
const CONTAINER_NAMES = ['tip', 'info', 'warning', 'danger', 'details', 'note', 'important', 'caution'];

// 文案由宿主壳经 config → env 注入，渲染层不再按目录猜语言
const labelsOf = (env) => env?.containerLabels ?? CONTAINER_LABELS.zh;

// 对齐 vitepress dist 的 extractTitle：优先 [标题]，其次语言名，最后 txt
function extractTitle(info, isHtml = false) {
  if (isHtml) return info.replace(/<!--[^]*?-->/g, '').match(/data-title="(.*?)"/)?.[1] || '';
  return info.match(/\[(.*)\]/)?.[1] || extractLang(info) || 'txt';
}

// 对齐 vitepress dist 的 createCodeGroupOpenRender：tab 头 + blocks 容器
function createCodeGroupOpenRender() {
  return (tokens, idx) => {
    let tabs = '';
    let checked = 'checked';
    for (let i = idx + 1; tokens[i].nesting !== -1 || tokens[i].type !== 'container_code-group_close'; i += 1) {
      const isHtml = tokens[i].type === 'html_block';
      if ((tokens[i].type === 'fence' && tokens[i].tag === 'code') || isHtml) {
        const title = extractTitle(isHtml ? tokens[i].content : tokens[i].info);
        if (title) {
          tabs += `<input type="radio" name="group-${idx}" id="tab-${i}" ${checked}><label data-title="${md.utils.escapeHtml(title)}" for="tab-${i}">${title}</label>`;
          if (checked && !isHtml) tokens[i].info += ' active';
          checked = '';
        }
      }
    }
    return `<div class="vp-code-group"><div class="tabs">${tabs}</div><div class="blocks">\n`;
  };
}

// 对齐官方 containers.ts:157-161：{open} / {no-title} 由 @mdit/plugin-attrs 转成 token 属性，
// 用后弹出，避免作为无意义属性留在 DOM 上
function attrPop(token, name) {
  const index = token.attrIndex(name);
  if (index < 0) return null;
  return token.attrs.splice(index, 1)[0][1];
}

// v-pre / raw / code-group：与 vitepress containerPlugin 的注册顺序和 DOM 一致
md.use(container, {
  name: 'v-pre',
  openRenderer: () => '<div v-pre>\n',
  closeRenderer: () => '</div>\n',
});
md.use(container, {
  name: 'raw',
  openRenderer: () => '<div class="vp-raw">\n',
  closeRenderer: () => '</div>\n',
});
md.use(container, {
  name: 'code-group',
  openRenderer: createCodeGroupOpenRender(),
  closeRenderer: () => '</div></div>\n',
});

// 输出 DOM 与 VitePress 一致：普通容器 div + custom-block-title，details 用 details + summary
for (const name of CONTAINER_NAMES) {
  md.use(container, {
    name,
    openRenderer: (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const info = token.info.trim().slice(name.length).trim();
      const noTitle = name !== 'details' && attrPop(token, 'no-title') !== null;
      // attrs 插件产出的是 open=""，Vue 会把空字符串的布尔属性设为 false，改为真值
      const open = name === 'details' && attrPop(token, 'open') !== null;
      token.attrJoin('class', `${name} custom-block`);
      if (open) token.attrSet('open', 'open');
      const renderedAttrs = self.renderAttrs(token).trim();
      // footnote 插件的 footnote_tail 挂在 core ruler 上，renderInline 也会跑 core.process；
      // 若复用主 env（正文脚注已写入 env.footnotes），每次标题都会追加整段脚注块并撑坏 HTML。
      // 标题只需内联解析，故屏蔽 footnotes 状态。
      const titleHtml = md.renderInline(info || labelsOf(env)[`${name}Label`], { ...env, footnotes: undefined });
      if (name === 'details') {
        return `<details ${renderedAttrs}><summary>${titleHtml}</summary>\n`;
      }
      if (noTitle) return `<div ${renderedAttrs}>\n`;
      const titleClass = info ? 'custom-block-title' : 'custom-block-title custom-block-title-default';
      return `<div ${renderedAttrs}><p class="${titleClass}">${titleHtml}</p>\n`;
    },
    closeRenderer: () => (name === 'details' ? '</details>\n' : '</div>\n'),
  });
}

// 对齐 vitepress dist 的 github-alerts：> [!TYPE] 转为同款 custom-block
const ALERT_RE = /^\[!([\w-]+)\]([^\n\r]*)/;

md.core.ruler.after('block', 'github-alerts', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type !== 'blockquote_open') continue;
    const open = tokens[i];
    let endIndex = i + 1;
    while (
      endIndex < tokens.length &&
      (tokens[endIndex].type !== 'blockquote_close' || tokens[endIndex].level !== open.level)
    ) {
      endIndex += 1;
    }
    if (endIndex === tokens.length) continue;
    const close = tokens[endIndex];
    const firstContent = tokens.slice(i, endIndex + 1).find((token) => token.type === 'inline');
    if (!firstContent) continue;
    const match = firstContent.content.match(ALERT_RE);
    if (!match) continue;
    const type = match[1].toLowerCase();
    if (type === 'details' || !CONTAINER_NAMES.includes(type)) continue;
    const title = match[2].trim() || labelsOf(state.env)[`${type}Label`];
    firstContent.content = firstContent.content.slice(match[0].length).trimStart();
    open.type = 'github_alert_open';
    open.tag = 'div';
    open.meta = { title, type };
    close.type = 'github_alert_close';
    close.tag = 'div';
  }
});

md.renderer.rules.github_alert_open = (tokens, idx) => {
  const { title, type } = tokens[idx].meta;
  return `<div class="${type} custom-block github-alert"><p class="custom-block-title">${title}</p>\n`;
};

// 数学公式：这里只产出带原始 TeX 的占位标记，KaTeX 渲染留给运行时按需加载（见 ./math.js）
const isMathSpace = (code) => code === 0x20 || code === 0x09 || code === 0x0a;

md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
  if (state.env?.config?.markdown?.math === false) return false;
  if (state.src.charCodeAt(state.pos) !== 0x24) return false;
  const start = state.pos;
  const next = state.src.charCodeAt(start + 1);
  // 段落内的 $$...$$ 按块级公式处理；独立的 $$ 行由 math_block 负责
  if (next === 0x24) {
    const close = state.src.indexOf('$$', start + 2);
    if (close < 0 || close + 1 >= state.posMax) return false;
    const content = state.src.slice(start + 2, close);
    if (!content.trim()) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.markup = '$$';
      token.meta = { display: true };
      token.content = content;
    }
    state.pos = close + 2;
    return true;
  }
  // 开符后必须是有效内容，避免把货币写法当公式
  if (next < 0 || isMathSpace(next)) return false;
  let end = start + 1;
  while (end < state.posMax) {
    if (state.src.charCodeAt(end) === 0x24) {
      const prev = state.src.charCodeAt(end - 1);
      const after = state.src.charCodeAt(end + 1);
      if (!isMathSpace(prev) && !(after >= 0x30 && after <= 0x39)) break;
    }
    end += 1;
  }
  if (end >= state.posMax) return false;
  const content = state.src.slice(start + 1, end);
  if (!content.trim()) return false;
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = content;
  }
  state.pos = end + 1;
  return true;
});

md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
  if (state.env?.config?.markdown?.math === false) return false;
  const start = state.bMarks[startLine] + state.tShift[startLine];
  if (state.src.slice(start, start + 2) !== '$$') return false;
  if (state.src.charCodeAt(start + 2) === 0x24) return false;

  const lines = [];
  let nextLine = startLine + 1;
  let closed = false;
  const first = state.src.slice(start + 2, state.eMarks[startLine]);
  if (first.trimEnd().endsWith('$$')) {
    lines.push(first.slice(0, first.lastIndexOf('$$')));
    closed = true;
  } else {
    lines.push(first);
    for (; nextLine < endLine; nextLine += 1) {
      const line = state.src.slice(state.bMarks[nextLine] + state.tShift[nextLine], state.eMarks[nextLine]);
      if (line.trimEnd().endsWith('$$')) {
        lines.push(line.slice(0, line.lastIndexOf('$$')));
        nextLine += 1;
        closed = true;
        break;
      }
      lines.push(line);
    }
  }
  // 未闭合时返回 false，让原文继续按普通文本渲染，不吞后文
  if (!closed) return false;
  const content = lines.join('\n').replace(/^\n+|\n+$/g, '');
  if (!content.trim()) return false;
  if (!silent) {
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.markup = '$$';
    token.content = content;
    token.map = [startLine, nextLine];
  }
  state.line = nextLine;
  return true;
});

const renderMathPlaceholder = (display) => (tokens, idx) => {
  const tex = md.utils.escapeHtml(tokens[idx].content);
  const isDisplay = display || tokens[idx].meta?.display === true;
  return isDisplay
    ? `<div class="md-math-placeholder" data-display="true" data-tex="${tex}"></div>\n`
    : `<span class="md-math-placeholder" data-display="false" data-tex="${tex}"></span>`;
};
md.renderer.rules.math_inline = renderMathPlaceholder(false);
md.renderer.rules.math_block = renderMathPlaceholder(true);

// 语法糖开关：mark / sub / sup 默认开启，config.markdown.*: false 时在首次渲染前移除规则。
// 与自定义容器一样，开关按实例生效（md 是单例，不支持同一进程内多套配置共存）。
const SYNTAX_RULES = { mark: ['mark_='], sub: ['sub_~'], sup: ['sup_^'] };
let syntaxConfigured = false;

export function ensureSyntaxPlugins(config) {
  if (syntaxConfigured) return;
  syntaxConfigured = true;
  const options = config?.markdown ?? {};
  for (const [name, rules] of Object.entries(SYNTAX_RULES)) {
    if (options[name] === false) {
      for (const rule of rules) md.inline.ruler.disable(rule);
    }
  }
}

// 自定义容器：名字必须在 parse 前注册，故由 renderMarkdown 在首次渲染前用当前 config 注册（幂等）
const registeredCustomContainers = new Set();

export function ensureCustomContainers(config) {
  for (const c of config?.markdown?.container ?? []) {
    if (CONTAINER_NAMES.includes(c.type)) {
      throw new Error(`自定义容器类型 "${c.type}" 与内置容器冲突`);
    }
    if (registeredCustomContainers.has(c.type)) continue;
    registeredCustomContainers.add(c.type);
    md.use(container, {
      name: c.type,
      openRenderer: (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const info = token.info.trim().slice(c.type.length).trim();
        const noTitle = attrPop(token, 'no-title') !== null;
        token.attrJoin('class', `${c.type} custom-block`);
        const renderedAttrs = self.renderAttrs(token).trim();
        const titleHtml = md.renderInline(info || c.title || c.defaultTitle || c.type, {
          ...env,
          footnotes: undefined,
        });
        if (noTitle) return `<div ${renderedAttrs}>\n`;
        const titleClass = info || c.title ? 'custom-block-title' : 'custom-block-title custom-block-title-default';
        return `<div ${renderedAttrs}><p class="${titleClass}">${titleHtml}</p>\n`;
      },
      closeRenderer: () => '</div>\n',
    });
  }
}

// 代码块 preWrapper / v-pre / 行号：在 md 实例完成插件注册后再挂接（与 mdoc markdown-md.js 一致）
applyCodeBlock(md);

export default md;
export { md };

// 直接渲染入口（部分旧调用点用得到）
export function render(source, env) {
  return md.render(source, env);
}
