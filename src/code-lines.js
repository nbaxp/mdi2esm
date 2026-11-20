// 行切分：把 Prism 输出的扁平 HTML 按物理行拆开，跨行的 token 在换行处闭合、下一行重开。
// markdown 的 fence 渲染与独立代码块组件共用这一份实现，避免两处规则漂移。

// {1,3,5-7} → 行号集合（1 基）；只在 wrapLines 内部用
function parseHighlightLines(meta) {
  const match = /\{([\d,\s-]+)\}/.exec(meta ?? '');
  if (!match) return null;
  const lines = new Set();
  for (const part of match[1].split(',')) {
    const [start, end] = part.trim().split('-').map(Number);
    if (!Number.isFinite(start)) continue;
    const last = Number.isFinite(end) ? end : start;
    for (let line = start; line <= last; line += 1) lines.add(line);
  }
  return lines;
}

function splitHtmlLines(html) {
  const lines = [];
  const stack = [];
  let current = '';
  for (let i = 0; i < html.length; i += 1) {
    const char = html[i];
    if (char === '<') {
      const close = html.indexOf('>', i);
      if (close < 0) {
        current += html.slice(i);
        break;
      }
      const tag = html.slice(i, close + 1);
      if (tag.startsWith('</')) stack.pop();
      else if (!tag.endsWith('/>')) stack.push(tag);
      current += tag;
      i = close;
    } else if (char === '\n') {
      current += '</span>'.repeat(stack.length);
      lines.push(current);
      current = stack.join('');
    } else {
      current += char;
    }
  }
  current += '</span>'.repeat(stack.length);
  lines.push(current);
  return lines;
}

// VitePress/shiki notation diff：行尾注释里的 [!code ++] / [!code --] 标记整行增删。
// 对齐 @shikijs/transformers transformerNotationDiff（v3 算法）：
//   msg: 'Added' // [!code ++]  → 行加 diff add，注释（含 // 前缀）整段消失
//   // [!code ++]               → 标记独占一行时整行删除
//   [!code ++:2]                → 当前行与后一行（:2 表示共 2 行）
// VitePress 文档把 [!code 写成 [!!code 转义展示，这里单双叹号都认。
// 返回 { code, marks }：code 为移除标记后的源码，marks 与输出行号对齐（无标记时 null）。
const RE_NOTATION = /(\/{2}|#|;{1,2}|%{1,2}|--|\/\*|<!--)\s*\[!{1,2}code\s+(\+\+|--)(?::(\d+))?\]\s*(?:\*\/|-->)?\s*$/i;

export function extractNotationDiff(code) {
  const src = String(code ?? '').split('\n');
  const hits = new Map(); // 输入行号 → { type, span, index }
  src.forEach((line, index) => {
    const match = RE_NOTATION.exec(line);
    if (match) {
      hits.set(index, {
        type: match[2] === '++' ? 'add' : 'remove',
        span: Number(match[3] ?? 1) || 1,
        index: match.index,
      });
    }
  });
  if (!hits.size) return { code: String(code ?? ''), marks: null };

  // :N 会把当前行与后续行一起标记
  const spanMark = new Map();
  for (const [index, hit] of hits) {
    for (let i = index; i < Math.min(index + hit.span, src.length); i += 1) {
      if (!spanMark.has(i)) spanMark.set(i, hit.type);
    }
  }

  const out = [];
  const marks = [];
  src.forEach((line, index) => {
    const hit = hits.get(index);
    if (hit) {
      const text = line.slice(0, hit.index).trimEnd();
      if (!text.trim()) return; // 注释独占一行：整行删除
      out.push(text);
      marks.push(hit.type);
      return;
    }
    out.push(line);
    marks.push(spanMark.get(index) ?? null);
  });
  return { code: out.join('\n'), marks };
}

// Prism diff 语法会把行首 +/- 包成 .token.prefix span，与 .diff 行样式的 ::before 符号重复，
// 这里移除该 span，符号统一由 .diff.add/.remove 的 ::before 绘制。
// 内层 Prism 的 .token.line 保留官方类名，不做改名（改名会丢上游样式契约）。
export function stripDiffPrefixes(html) {
  return String(html).replace(/<span class="token prefix (?:inserted|deleted)">[+-]<\/span>/g, '');
}

// Git diff 行级标记：行首 + / - 标 add/remove；+++ / --- 文件头与 @@ hunk 头不标。
// 复用 wrapLines 的 marks 通道，```diff 与 notation（[!code ++]/--）共用同一套 .diff 行样式。
export function extractDiffMarks(code) {
  return String(code ?? '')
    .split('\n')
    .map((line) => {
      if (/^(?:\+\+\+|---|@@)/.test(line)) return null;
      if (line.startsWith('+')) return 'add';
      if (line.startsWith('-')) return 'remove';
      return null;
    });
}

// 给每个物理行加 .line 包裹，供 .highlighted / 行号样式复用。入参是 <code> 内层 HTML。
// marks 为行级标记（extractNotationDiff 或 extractDiffMarks，无标记时传 null）。
export function wrapLines(inner, meta, marks = null) {
  let body = inner;
  const trailing = body.endsWith('\n');
  if (trailing) body = body.slice(0, -1);
  const highlighted = parseHighlightLines(meta);
  const raw = splitHtmlLines(body);
  // Prism 的 token（diff 等）内容带换行，代码末尾换行会多拆出只含空 token 的尾行，丢弃
  const textOf = (s) => s.replace(/<[^>]*>/g, '').trim();
  while (raw.length > 1 && !textOf(raw[raw.length - 1])) raw.pop();
  const lines = raw.map((line, index) => {
    const active = highlighted?.has(index + 1) ? ' highlighted' : '';
    const diff = marks?.[index] ? ` diff ${marks[index]}` : '';
    return `<span class="line${active}${diff}">${line || '<wbr>'}</span>`;
  });
  return lines.join('\n') + (trailing ? '\n' : '');
}

// 入参是含 <code> 的整段 HTML（markdown-it 的 fence 输出），行包裹后原样拼接回去。
export function wrapCodeLines(html, meta, marks = null) {
  const codeOpen = html.indexOf('<code');
  const codeStart = html.indexOf('>', codeOpen);
  const codeEnd = html.lastIndexOf('</code>');
  if (codeOpen < 0 || codeStart < 0 || codeEnd < codeStart) return html;
  const inner = html.slice(codeStart + 1, codeEnd);
  return html.slice(0, codeStart + 1) + wrapLines(inner, meta, marks) + html.slice(codeEnd);
}
