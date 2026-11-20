// Prism 代码高亮：同步 API，直接接入 markdown-it 的 fence 渲染。
// 语言组件按需静态引入，构建时由 Vite 内联；不再依赖 shiki 的异步加载与渲染后 DOM 替换。
/* eslint-disable simple-import-sort/imports -- Prism 语言组件必须在 prismjs 核心之后执行 */
import Prism from 'prismjs';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-batch.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-csharp.js';
import 'prismjs/components/prism-diff.js';
import 'prismjs/components/prism-docker.js';
import 'prismjs/components/prism-fortran.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-ini.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-kotlin.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-markup-templating.js';
import 'prismjs/components/prism-matlab.js';
import 'prismjs/components/prism-nasm.js';
import 'prismjs/components/prism-nginx.js';
import 'prismjs/components/prism-pascal.js';
import 'prismjs/components/prism-perl.js';
import 'prismjs/components/prism-php.js';
import 'prismjs/components/prism-powershell.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-r.js';
import 'prismjs/components/prism-ruby.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-swift.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-visual-basic.js';
import 'prismjs/components/prism-yaml.js';
/* eslint-enable simple-import-sort/imports */

// Prism 未注册、但 mdi2esm 需要兼容的写法。
// 其余别名（cs/ts/js/sh/yml/md/py/html/xml/dockerfile…）由 Prism 语言组件自带。
const LANG_ALIASES = {
  asm: 'nasm',
  bat: 'batch',
  'c#': 'csharp',
  'c++': 'cpp',
  cmd: 'batch',
  cplusplus: 'cpp',
  cs: 'csharp',
  delphi: 'pascal',
  shellscript: 'bash',
  template: 'markup',
  vb: 'visual-basic',
  vbnet: 'visual-basic',
  vue: 'markup',
  'vue-html': 'markup',
  yml: 'yaml',
};

// ```ts:no-line-numbers 这类 info 会把标记拼在语言名后，取冒号前的语言名。
export function normalizeLang(lang) {
  const key = String(lang ?? '')
    .trim()
    .toLowerCase()
    .split(':')[0];
  return LANG_ALIASES[key] ?? key;
}

// ```diff / ```diff-xxx 是 Git diff 写法：Prism 的 diff 语法负责内容高亮，
// 增删行背景由行级 .diff 标记（extractDiffMarks）复用 notation 样式实现
export const isDiffLang = (lang) => /^diff(?:-[\w-]+)?$/i.test(String(lang ?? ''));

/**
 * 高亮一段代码。
 * @param {string} code 源码
 * @param {string} lang 语言名或别名
 * @returns {string|null} 高亮后的 HTML；Prism 不认识该语言时返回 null，由调用方转义为纯文本
 */
export function highlightCode(code, lang) {
  const name = normalizeLang(lang);
  // diff-xxx 语言 Prism 未注册语法，回落到 diff 语法
  const grammar = Prism.languages[name] ?? (isDiffLang(name) ? Prism.languages.diff : undefined);
  if (!grammar) return null;
  try {
    return Prism.highlight(code, grammar, name);
  } catch {
    // 单个语法异常不应让整页渲染失败，退回纯文本
    return null;
  }
}
