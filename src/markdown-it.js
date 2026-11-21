// Markdown → 渲染实例装配（移植自 mdoc）
// 依赖由 Vite 打包进库产物，在此完成 markdown-it 与插件装配
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
import { CONTAINER_LABELS } from './config.js';
import { applyRestoreEntities, applyTablePlugin, extractLang } from './markdown-plugins.js';
import { applyTableChart } from './table-chart.js';

const md = new MarkdownIt({ html: true, linkify: true });
// 对齐 mdoc / VitePress：只认显式协议链接，裸域名不自动成链
md.linkify.set({ fuzzyLink: false });

// 移植自 mdoc：VitePress 官方纯规则（实体还原、表格可聚焦），须在插件注册前挂接
applyRestoreEntities(md);
applyTablePlugin(md);
// 表格首格 :line: / :bar: 等声明 → 前置 <EChartsTableBlock>（原表格保留）
applyTableChart(md);

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

// 音视频嵌入：!video[标题](url) / !audio[标题](url)（对齐 cherry 语法）。
// src 与图片一样在 link_rewrite 里按 env.dir / adapters 重写，渲染层不拼路径。
const MEDIA_RE = /^!(video|audio)\[([^\]]*)\]\(([^)\s]+)\)/;

md.inline.ruler.after('escape', 'media', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x21 /* ! */) return false;
  const match = MEDIA_RE.exec(state.src.slice(state.pos, state.posMax));
  if (!match) return false;
  if (!silent) {
    const token = state.push('media', '', 0);
    token.attrSet('type', match[1]);
    token.attrSet('title', match[2]);
    token.attrSet('src', match[3]);
  }
  state.pos += match[0].length;
  return true;
});

md.renderer.rules.media = (tokens, idx) => {
  const token = tokens[idx];
  const type = token.attrGet('type') === 'audio' ? 'audio' : 'video';
  const src = md.utils.escapeHtml(token.attrGet('src') ?? '');
  const title = token.attrGet('title') ?? '';
  const titleAttr = title ? ` title="${md.utils.escapeHtml(title)}"` : '';
  const fallback = title ? md.utils.escapeHtml(title) : '您的浏览器不支持';
  return `<${type} class="vp-media" controls src="${src}"${titleAttr}>${fallback}</${type}>`;
};

// emoji：用 markdown-it-emoji（不内置）——宿主提供了就启用（full 数据，GitHub / VitePress 同套），
// 没装时动态 import 失败，静默回退，`:名字:` 按普通文本原样保留。
// 插件挂载是异步的：管线的 createMarkdownComponent 会在首次渲染前 await（见 pipeline.js），
// 直接用 renderMarkdown / render 的调用点在插件就绪前渲染到的是原文，之后的渲染自动带上 emoji。
let emojiReady;
export function ensureEmojiPlugin() {
  emojiReady ??= import('markdown-it-emoji').then((emoji) => md.use(emoji.full)).catch(() => {});
  return emojiReady;
}

// 标题锚点：permalink 对齐官方 .header-anchor 与 aria-label，顺带收集 h2–h6 供目录
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
    if (level >= 2) {
      // 目录编号：h2 起分级计数（1 / 1.1 / …），存 env 供 [[toc]] 与标题前缀读取；
      // 不进 slug 与 headings.title，锚点与右侧大纲保持稳定
      const counters = (state.env.tocCounters ??= [0, 0, 0, 0, 0, 0, 0]);
      counters[level] += 1;
      for (let l = level + 1; l < counters.length; l += 1) counters[l] = 0;
      const parts = [];
      for (let l = 2; l <= level; l += 1) parts.push(counters[l]);
      const number = parts.join('.');
      const headingToken = state.tokens[idx];
      headingToken.meta = { ...(headingToken.meta ?? {}), number };
      (state.env.tocNumbersBySlug ??= {})[slug] = number;
      // line：标题在原文中的行号（1-based）。优先用 env.lineMap 还原（剥离 frontmatter/script 后仍准确），否则退回 body 内行号
      const mapLine = headingToken.map?.[0] ?? 0;
      const line = state.env.lineMap?.[mapLine] ?? mapLine + 1;
      state.env.headings?.push({ level, title, slug, line });
    }
    children.push(
      Object.assign(new state.Token('text', '', 0), { content: ' ' }),
      Object.assign(new state.Token('link_open', 'a', 1), {
        attrs: [
          ['class', 'header-anchor'],
          ['href', `#${slug}`],
          ['aria-label', `Permalink to “${title}”`],
        ],
      }),
      new state.Token('link_close', 'a', -1),
    );
  },
});

// [[toc]]：与 anchor 共用 slugify，format 还原 restoreEntities 保留的 &amp;
// level 给全量（h2-h6），实际渲染按 config.markdown.toc.level 过滤
md.use(tocPlugin, {
  slugify,
  format: (title) => title.replaceAll('&amp;', '&'),
  level: [2, 6],
});

// 目录层级：config.markdown.toc.level，默认 h2-h3（对齐 VitePress）
const tocLevelOf = (env) => {
  const level = env?.config?.markdown?.toc?.level;
  return Array.isArray(level) && level.length ? level : [2, 3];
};

// 目录树：与 buildOutline 同一套按 level 的栈式嵌套；level 是 [min, max] 区间语义
function tocTree(headings, allowed) {
  const levels = (Array.isArray(allowed) ? allowed : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
  const min = levels.length ? Math.min(...levels) : 2;
  const max = levels.length ? Math.max(...levels) : 6;
  const root = [];
  const stack = [];
  for (const heading of headings) {
    if (heading.level < min || heading.level > max) continue;
    const item = { link: `#${heading.slug}`, title: heading.title, slug: heading.slug, children: [] };
    while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
    if (stack.length) stack[stack.length - 1].item.children.push(item);
    else root.push(item);
    stack.push({ level: heading.level, item });
  }
  return root;
}

// 多目录：allowMultiToc=false 时只渲染第一个 [[toc]]，其余占位符输出空并告警
md.core.ruler.after('anchor', 'toc_multi', (state) => {
  if (state.env?.config?.markdown?.toc?.allowMultiToc === false) {
    let seen = 0;
    for (const token of state.tokens) {
      if (token.type !== 'toc_body') continue;
      seen += 1;
      if (seen > 1) token.meta = { ...(token.meta ?? {}), skip: true };
    }
    if (seen > 1) {
      console.warn('[mdi2esm] markdown.toc.allowMultiToc=false：只渲染第一个 [[toc]]，其余已忽略');
    }
  }
});

// 覆盖插件的 toc_body 渲染：支持层级过滤、自动编号、多目录跳过，
// DOM 结构（nav.table-of-contents > ul > li > a）与插件默认保持一致
md.renderer.rules.toc_body = (tokens, idx, options, env) => {
  if (tokens[idx].meta?.skip) return '';
  const showNumber = env?.config?.markdown?.toc?.showAutoNumber === true;
  const numbers = env?.tocNumbersBySlug ?? {};
  const list = (nodes) =>
    `<ul>${nodes
      .map((node) => {
        const number = numbers[node.slug];
        const prefix =
          showNumber && number
            ? `<span class="toc-number" aria-hidden="true">${md.utils.escapeHtml(number)}</span> `
            : '';
        const children = node.children.length ? list(node.children) : '';
        return `<li><a href="${node.link}">${prefix}${md.utils.escapeHtml(node.title)}</a>${children}</li>`;
      })
      .join('')}</ul>`;
  const tree = tocTree(env.headings ?? [], tocLevelOf(env));
  return tree.length ? list(tree) : '';
};

// 标题编号：showAutoNumber 时给标题加编号前缀（编号存 anchor 写入的 token.meta）
const defaultHeadingOpen =
  md.renderer.rules.heading_open ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const open = defaultHeadingOpen(tokens, idx, options, env, self);
  const number = tokens[idx].meta?.number;
  if (!number || env?.config?.markdown?.toc?.showAutoNumber !== true) return open;
  return `${open}<span class="toc-number" aria-hidden="true">${md.utils.escapeHtml(number)}</span> `;
};

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
          if (!isHtml) {
            if (checked) tokens[i].info += ' active';
            // preWrapper 用 meta 判定：组内标题只作 tab 标签，不渲染 .vp-code-block-title
            tokens[i].meta = { ...(tokens[i].meta ?? {}), codeGroup: true };
          }
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

// 时间线：:::timeline [标题] 容器，内部用独占一行的 :: 分隔节点，
// 节点首行 [状态] [日期] 标题，其后为描述（按普通 markdown 渲染）。
// 必须注册在 plugin-container 之前，避免 :::timeline 先被通用容器规则尝试。
const TIMELINE_OPEN_RE = /^ {0,3}:::timeline(?:[ \t]+(.*))?$/;
const TIMELINE_SEP_RE = /^ {0,3}::(?:[ \t]+(.*))?$/;
const TIMELINE_CLOSE_RE = /^ {0,3}:::[ \t]*$/;
const TIMELINE_HEAD_RE = /^\[([^\]]*)\][ \t]*(.*)$/;
const TIMELINE_DATE_RE = /^(\S+)[ \t]+(.*)$/;
const TIMELINE_STATE_ALIASES = {
  done: 'done',
  x: 'done',
  '✓': 'done',
  doing: 'doing',
  '~': 'doing',
  '…': 'doing',
  todo: 'todo',
  ' ': 'todo',
  '[]': 'todo',
  milestone: 'milestone',
  '*': 'milestone',
  '★': 'milestone',
  error: 'error',
  '!': 'error',
  '×': 'error',
};

function parseTimelineHead(text) {
  const line = text.trim();
  const match = TIMELINE_HEAD_RE.exec(line);
  if (!match) return { state: 'todo', time: '', title: line };
  const state = TIMELINE_STATE_ALIASES[String(match[1]).toLowerCase()] ?? 'todo';
  const rest = match[2].trim();
  if (!rest) return { state, time: '', title: '' };
  const parts = TIMELINE_DATE_RE.exec(rest);
  if (parts && /\d/.test(parts[1])) return { state, time: parts[1], title: parts[2].trim() };
  return { state, time: '', title: rest };
}

function timelineRule(state, startLine, endLine, silent) {
  const startText = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]);
  const openMatch = TIMELINE_OPEN_RE.exec(startText);
  if (!openMatch) return false;
  let closeLine = -1;
  for (let line = startLine + 1; line < endLine; line += 1) {
    const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    if (TIMELINE_CLOSE_RE.test(text)) {
      closeLine = line;
      break;
    }
  }
  if (closeLine === -1) return false; // 未闭合：交回普通 markdown
  if (silent) return true;
  const open = state.push('timeline_open', 'div', 1);
  open.block = true;
  open.meta = { title: (openMatch[1] ?? '').trim() };
  open.map = [startLine, closeLine + 1];
  let nodeStart = -1;
  const flush = (from, to) => {
    if (from < 0 || to <= from) return;
    const rawLines = [];
    for (let i = from; i < to; i += 1) {
      rawLines.push(state.src.slice(state.bMarks[i] + state.tShift[i], state.eMarks[i]));
    }
    const head = parseTimelineHead(rawLines[0].replace(/^ {0,3}::/, ''));
    const item = state.push('timeline_item', 'div', 1);
    item.block = true;
    item.meta = head;
    item.content = rawLines.slice(1).join('\n');
  };
  for (let line = startLine + 1; line < closeLine; line += 1) {
    const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    if (TIMELINE_SEP_RE.test(text)) {
      flush(nodeStart, line);
      nodeStart = line;
    } else if (nodeStart === -1 && text.trim()) {
      nodeStart = line; // 宽松：首个 :: 之前的非空行也当作一个节点
    }
  }
  flush(nodeStart, closeLine);
  const close = state.push('timeline_close', 'div', -1);
  close.block = true;
  state.line = closeLine + 1;
  return true;
}
md.block.ruler.before('fence', 'timeline', timelineRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

// 描述是独立子文档：渲染时用副本 env，避免节点内标题污染主文档的 headings / 编号计数，
// 也不把主文档脚注（env.footnotes）带进节点
const timelineDescEnv = (env) => ({
  ...(env ?? {}),
  headings: [],
  tocNumbersBySlug: {},
  tocCounters: [0, 0, 0, 0, 0, 0, 0],
  footnotes: undefined,
});

md.renderer.rules.timeline_open = (tokens, idx) => {
  const { title } = tokens[idx].meta;
  const header = title ? `<div class="mdi-timeline__header">${md.utils.escapeHtml(title)}</div>` : '';
  return `<div class="mdi-timeline">${header}<div class="mdi-timeline__body">\n`;
};

md.renderer.rules.timeline_item = (tokens, idx, options, env) => {
  const { state, time, title } = tokens[idx].meta;
  const descEnv = timelineDescEnv(env);
  const timeHtml = time ? `<div class="mdi-timeline__time">${md.utils.escapeHtml(time)}</div>` : '';
  const titleHtml = title ? `<div class="mdi-timeline__title">${md.renderInline(title, descEnv)}</div>` : '';
  const desc = tokens[idx].content.trim() ? md.render(tokens[idx].content, descEnv) : '';
  return `<div class="mdi-timeline__item mdi-timeline__item--${state}"><div class="mdi-timeline__node"></div><div class="mdi-timeline__content">${timeHtml}${titleHtml}<div class="mdi-timeline__desc">${desc}</div></div></div>\n`;
};

md.renderer.rules.timeline_close = () => '</div></div>\n';

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
