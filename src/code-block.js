// mdi2esm 自身的 fence 渲染：DOM 外壳对齐 VitePress preWrapper（button.copy + span.lang + pre）。
import { wrapCodeLines } from './code-lines.js';
import { highlightCode } from './highlight.js';
import { applyLineNumbers, fenceMetaAttrs } from './markdown-plugins.js';

// 代码块外层包装：对齐 VitePress preWrapper 的 DOM（button.copy + span.lang + pre）
function extractLang(info) {
  return (
    /^[a-zA-Z0-9-_]+/
      .exec(info)?.[0]
      .replace(/-vue$/, '')
      .replace(/^vue-html$/, 'template')
      .replace(/^ansi$/, '') || ''
  );
}

// 复制按钮：非安全上下文或权限被拒时退回 textarea + execCommand
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 继续走降级路径
  }
  try {
    const element = document.createElement('textarea');
    const previouslyFocused = document.activeElement;
    element.value = text;
    element.setAttribute('readonly', '');
    element.style.contain = 'strict';
    element.style.position = 'absolute';
    element.style.insetInlineStart = '-9999px';
    element.style.fontSize = '12pt';
    document.body.appendChild(element);
    element.select();
    element.selectionStart = 0;
    element.selectionEnd = text.length;
    const ok = document.execCommand('copy');
    element.remove();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    return ok;
  } catch {
    return false;
  }
}

const COPY_RESET_MS = 2000;
const copyTimers = new WeakMap();

function copyCode(button) {
  const pre = button.parentElement?.querySelector('pre');
  if (!pre) return;
  const clone = pre.cloneNode(true);
  clone.innerHTML = clone.innerHTML.replace(/\n+/g, '\n');
  copyText(clone.textContent ?? '').then((ok) => {
    if (!ok) return;
    button.classList.add('copied');
    clearTimeout(copyTimers.get(button));
    copyTimers.set(
      button,
      window.setTimeout(() => {
        button.classList.remove('copied');
        button.blur();
        copyTimers.delete(button);
      }, COPY_RESET_MS),
    );
  });
}

// code-group 与复制按钮共用一次委托监听（对齐 VitePress codeGroups/copyCode 的触发方式）
function onCodeBlockClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const copy = target.closest('button.copy');
  if (copy) {
    event.preventDefault();
    copyCode(copy);
    return;
  }

  const input = target.closest('.vp-code-group input');
  if (!input) return;
  const group = input.parentElement?.parentElement;
  if (!group) return;
  const index = Array.from(group.querySelectorAll('input')).indexOf(input);
  if (index < 0) return;
  const blocks = group.querySelector('.blocks');
  if (!blocks) return;
  const current = Array.from(blocks.children).find((child) => child.classList.contains('active'));
  if (!current) return;
  const next = blocks.children[index];
  if (!next || current === next) return;
  current.classList.remove('active');
  next.classList.add('active');
  group.querySelector(`label[for="${input.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

// @mdit/plugin-container 的闭合扫描基于原始行，围栏里的 ::: 会被误判成容器闭合。
// 渲染前给围栏内以 : 开头的行插入私有区占位符，渲染后还原，代码显示不受影响
const FENCE_MASK = '';

export function maskFenceMarkers(source) {
  const lines = source.split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && marker[2].trim() === '') {
        fence = null;
      } else {
        lines[i] = line.replace(/^(\s*)(:)/, `$1${FENCE_MASK}$2`);
      }
      continue;
    }
    if (marker) fence = { char: marker[1][0], length: marker[1].length };
  }
  return lines.join('\n');
}

export const unmaskFenceMarkers = (html) => html.split(FENCE_MASK).join('');

// 将 preWrapper / v-pre / 行号 注册到给定的 markdown-it 实例（由 markdown-md.js 调用，避免循环依赖）
export function applyCodeBlock(md) {
  // markdown-it 的 fence 默认规则会调用 options.highlight；Prism 是同步的，
  // 因此高亮可以直接发生在渲染期，不再需要渲染后的 DOM 替换。
  md.options.highlight = (code, lang) => highlightCode(code, lang) ?? md.utils.escapeHtml(code);

  function wrapPre(html, token, env) {
    if (extractLang(token.info) === 'mermaid') {
      return `<div class="mermaid-block"><pre class="mermaid-source" v-pre>${md.utils.escapeHtml(token.content)}</pre></div>\n`;
    }
    const lineMeta = fenceMetaAttrs(token.info);
    token.info = token.info.replace(/\[.*\]/, '');
    const active = / active( |$)/.test(token.info) ? ' active' : '';
    token.info = token.info.replace(/ active$/, '').replace(/ active /, ' ');
    const lang = extractLang(token.info);
    const label = md.utils.escapeHtml(lang.replace(/_/g, ' '));
    const copy = env?.copyLabels ?? {};
    const title = md.utils.escapeHtml(copy.tooltipText ?? '');
    const copied = md.utils.escapeHtml(copy.copiedText ?? '');
    const meta = md.utils.escapeHtml(token.info);
    const withLines = wrapCodeLines(html, lineMeta);
    return `<div class="language-${lang}${active}" dir="ltr" data-meta="${meta}"><button class="copy" title="${title}" data-copied="${copied}"></button><span class="lang">${label}</span>${withLines}</div>`;
  }
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) =>
    wrapPre(defaultFence(tokens, idx, options, env, self).replace('<pre', '<pre v-pre'), tokens[idx], env);
  const defaultCodeBlock = md.renderer.rules.code_block;
  md.renderer.rules.code_block = (tokens, idx, options, env, self) =>
    defaultCodeBlock(tokens, idx, options, env, self).replace('<pre', '<pre v-pre');
  const defaultCodeInline = md.renderer.rules.code_inline;
  md.renderer.rules.code_inline = (tokens, idx, options, env, self) =>
    defaultCodeInline(tokens, idx, options, env, self).replace('<code', '<code v-pre');
  // 官方 markdown.ts:426：lineNumbers 必须在 preWrapper 之后注册（它增补 preWrapper 的输出）；
  // 全局开关由 config.markdown.lineNumbers 在渲染期提供
  applyLineNumbers(md);
  if (typeof document !== 'undefined') document.addEventListener('click', onCodeBlockClick);
}
