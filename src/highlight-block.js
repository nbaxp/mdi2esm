// 独立代码块：给宿主组件用的同步高亮 API。
// 与 markdown fence 共用 Prism 语法与行切分，输出不含复制按钮（交互由宿主决定）。
import { wrapLines } from './code-lines.js';
import { highlightCode, normalizeLang } from './highlight.js';
import { escapeHtml } from './markdown-plugins.js';

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
  const highlighted = highlightCode(String(code ?? ''), name);
  const ok = highlighted !== null;
  const inner = wrapLines(ok ? highlighted : escapeHtml(String(code ?? '')), meta);
  const classes = [`language-${sanitizeLang(name) || 'text'}`, className].filter(Boolean).join(' ');
  return { html: `<pre class="${classes}"><code>${inner}</code></pre>`, lang: name, ok };
}
