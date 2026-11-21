// 独立代码块：给宿主组件用的同步高亮 API。
// 与 markdown fence 共用 Prism 语法与行切分，输出不含复制按钮（交互由宿主决定）。
import { extractDiffMarks, extractNotation, stripDiffPrefixes, wrapLines } from './code-lines.js';
import { escapeHtml } from './markdown-plugins.js';
import { highlightCode, isDiffLang, normalizeLang } from './prism.js';

// 语言名只允许字母数字与 - _ + # .，避免拼进 class 属性时被注入
const sanitizeLang = (name) => String(name ?? '').replace(/[^\w+#.-]/g, '');

/**
 * 高亮一段代码并返回完整代码块 HTML。
 *
 * @param {string} code 源码
 * @param {string} lang 语言名或别名（ts / vue / c# / yml …）
 * @param {object} [options]
 * @param {string} [options.meta] fence meta，可含 `{1,3-5}` 行高亮
 * @param {string} [options.className] 追加到 `<pre>` 的类名
 * @returns {{ html: string, lang: string, ok: boolean }}
 *   `ok` 为 false 表示语言未注册，内容已转义为纯文本
 */
export function highlightBlock(code, lang, { meta = '', className = '' } = {}) {
  const name = normalizeLang(lang) || 'text';
  // [!code ...] 先移除再高亮（与 fence 同一套提取逻辑）
  const raw = String(code ?? '');
  const extracted = extractNotation(raw);
  const cleaned = extracted.code;
  const highlighted = highlightCode(cleaned, name);
  const ok = highlighted !== null;
  // ```diff / ```diff-xxx：按行首 +/- 生成行级标记（与 notation 共用 .diff 行样式）
  const marks = extracted.marks ?? (isDiffLang(name) ? extractDiffMarks(cleaned) : null);
  const inner = wrapLines(ok ? stripDiffPrefixes(highlighted) : escapeHtml(cleaned), meta, marks);
  const classes = [`language-${sanitizeLang(name) || 'text'}`, className].filter(Boolean).join(' ');
  // has-diff / has-highlighted 对齐 VitePress 加在 <pre> 上（不是外层 div）
  const hasDiff = extracted.hasDiff || Boolean(marks?.some((mark) => mark === 'add' || mark === 'remove'));
  const preExtra = [
    hasDiff && 'has-diff',
    extracted.hasHighlighted && 'has-highlighted',
    extracted.focused && 'has-focused-lines',
  ]
    .filter(Boolean)
    .join(' ');
  // :line-numbers / :line-numbers=2（对齐 VitePress 的 lineNumbers.ts）
  const lineNumbers = /line-numbers\b/.test(meta ?? '');
  const start = Number(/line-numbers=(\d+)/.exec(meta ?? '')?.[1] ?? 1);
  const count = inner.endsWith('\n') ? inner.slice(0, -1).split('\n').length : inner.split('\n').length;
  const wrapper = lineNumbers
    ? `<div class="line-numbers-wrapper" aria-hidden="true">${Array.from({ length: count }, (_, i) => `<span class="line-number">${i + start}</span><br>`).join('')}</div>`
    : '';
  const mode = lineNumbers ? ' line-numbers-mode' : '';
  return {
    html: `<div class="${classes}${mode}" dir="ltr">${wrapper}<pre class="shiki ${classes}${preExtra ? ` ${preExtra}` : ''}"><code>${inner}</code></pre></div>`,
    lang: name,
    ok,
  };
}
