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

// 给每个物理行加 .line 包裹，供 .highlighted / 行号样式复用。入参是 <code> 内层 HTML。
export function wrapLines(inner, meta) {
  let body = inner;
  const trailing = body.endsWith('\n');
  if (trailing) body = body.slice(0, -1);
  const highlighted = parseHighlightLines(meta);
  const lines = splitHtmlLines(body).map((line, index) => {
    const active = highlighted?.has(index + 1) ? ' highlighted' : '';
    return `<span class="line${active}">${line || '<wbr>'}</span>`;
  });
  return lines.join('\n') + (trailing ? '\n' : '');
}

// 入参是含 <code> 的整段 HTML（markdown-it 的 fence 输出），行包裹后原样拼接回去。
export function wrapCodeLines(html, meta) {
  const codeOpen = html.indexOf('<code');
  const codeStart = html.indexOf('>', codeOpen);
  const codeEnd = html.lastIndexOf('</code>');
  if (codeOpen < 0 || codeStart < 0 || codeEnd < codeStart) return html;
  const inner = html.slice(codeStart + 1, codeEnd);
  return html.slice(0, codeStart + 1) + wrapLines(inner, meta) + html.slice(codeEnd);
}
