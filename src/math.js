// KaTeX 公式渲染：入口只产出占位标记，这里按需加载 katex 并替换。
// katex 本体与它的 CSS 都由调用方提供——样式由宿主自己 import，库不注入 <link>。
import { lazyModule } from './lazy-module.js';

const loadKatex = lazyModule(() => import('katex'));

// 解码 md.utils.escapeHtml 对 TeX 做的实体转义：markdown-it 只转义 & < > "，不含单引号
function decodeAttr(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// 占位符形状由 markdown-it.js 固定产出：
//   <div class="md-math-placeholder" data-display="true" data-tex="..."></div>
//   <span class="md-math-placeholder" data-display="false" data-tex="..."></span>
// data-tex 已经过 escapeHtml，内部不会再出现裸的 `"`。
const PLACEHOLDER_RE = /<(div|span) class="md-math-placeholder" data-display="(true|false)" data-tex="([^"]*)"><\/\1>/g;

export async function renderMath(html) {
  if (!html.includes('class="md-math-placeholder"')) return html;

  const katex = await loadKatex();
  const renderToString = katex?.renderToString ?? katex?.default?.renderToString;
  if (!renderToString) {
    console.warn('[markdown-it] KaTeX 加载失败，公式按原始文本渲染');
    return html.replace(PLACEHOLDER_RE, (_m, _tag, _display, tex) => decodeAttr(tex));
  }

  // 只替换占位符字符串本身，绝不对整段模板做 innerHTML round-trip：
  // 后者会让浏览器重新解析 HTML，把自闭合自定义标签（如 <Icon />）当成未闭合
  // 开始标签层层嵌套并小写化，静默吞掉后续内容。
  return html.replace(PLACEHOLDER_RE, (_m, _tag, displayAttr, texEncoded) => {
    const display = displayAttr === 'true';
    const tex = decodeAttr(texEncoded);
    let out;
    try {
      out = renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore' });
    } catch (err) {
      console.warn('[markdown-it] KaTeX 渲染失败：', tex, err);
      return `<span class="katex-error">${tex}</span>`;
    }
    if (out.includes('katex-error')) console.warn('[markdown-it] KaTeX 解析失败：', tex);
    // out 由 KaTeX 自己生成，内容自洽、不含占位符，直接插入即可。
    // display 模式下 KaTeX 已产出 .katex-display 容器，无需额外包裹。
    return out;
  });
}
