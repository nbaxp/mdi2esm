const BOM = '\uFEFF';
const START_RE = /^---[ \t]*\r?$/;
const END_RE = /^(?:---|\.\.\.)[ \t]*\r?$/;

const stripBom = (raw) => (raw.startsWith(BOM) ? raw.slice(1) : raw);

// 结束行序号；首行无效或找不到结束行时返回 -1
function frontmatterEnd(lines) {
  if (!START_RE.test(lines[0])) return -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (END_RE.test(lines[i])) return i;
  }
  return -1;
}

// 只剥离文件顶部结构有效的 frontmatter：不解析 YAML、不做语义校验、不改动正文
export const stripFrontmatter = (raw) => {
  const source = stripBom(raw);
  const lines = source.split('\n');
  const end = frontmatterEnd(lines);
  return end < 0 ? source : lines.slice(end + 1).join('\n');
};

const unquote = (value) => {
  const text = value.trim();
  if (text.length >= 2) {
    const quote = text[0];
    if ((quote === '"' || quote === "'") && text[text.length - 1] === quote) {
      const inner = text.slice(1, -1);
      return quote === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'");
    }
  }
  return text;
};

// 基础标量：布尔、null、数字、行内数组，其余按字符串（去引号）
const parseScalar = (value) => {
  const text = unquote(value);
  if (text === '') return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith('[') && text.endsWith(']')) {
    return text
      .slice(1, -1)
      .split(',')
      .map((item) => parseScalar(item))
      .filter((item) => item !== '');
  }
  return text;
};

// 极简 YAML 子集：key: value、一层嵌套、短横线数组、行内数组。
// 复杂结构（多行块、锚点、多文档）不解析，交给 config.markdown.frontmatterParser 替换。
const parseBlock = (lines, startIndex, indent) => {
  const result = {};
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const leading = line.match(/^ */)[0].length;
    if (leading < indent) break;
    if (leading > indent) {
      // 缩进跳跃（非一层嵌套）交给上层忽略，避免死循环
      i += 1;
      continue;
    }
    const text = line.slice(indent);
    const arrayItem = /^-(?:\s+(.*))?$/.exec(text);
    if (arrayItem) break;
    const pair = /^([^:]+):(.*)$/.exec(text);
    if (!pair) {
      i += 1;
      continue;
    }
    const key = unquote(pair[1]);
    const rest = pair[2].trim();
    if (rest !== '') {
      result[key] = parseScalar(rest);
      i += 1;
      continue;
    }
    // 值在下一层：可能是数组，也可能是嵌套映射
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j += 1;
    if (j < lines.length) {
      const nextIndent = lines[j].match(/^ */)[0].length;
      const nextText = lines[j].slice(nextIndent);
      if (nextIndent > indent && /^-(?:\s|$)/.test(nextText)) {
        const items = [];
        while (j < lines.length) {
          const itemLine = lines[j];
          const itemIndent = itemLine.match(/^ */)[0].length;
          const itemText = itemLine.slice(itemIndent);
          if (itemIndent !== nextIndent || !/^-(?:\s|$)/.test(itemText)) break;
          items.push(parseScalar(itemText.replace(/^-\s*/, '')));
          j += 1;
        }
        result[key] = items;
        i = j;
        continue;
      }
      if (nextIndent > indent) {
        const nested = parseBlock(lines, j, nextIndent);
        result[key] = nested.value;
        i = nested.next;
        continue;
      }
    }
    result[key] = {};
    i += 1;
  }

  return { value: result, next: i };
};

/**
 * 解析文件顶部 frontmatter，返回 `{ body, data }`。
 *
 * 只支持 YAML 子集（标量、一层嵌套、数组、行内数组）。需要完整 YAML 时，
 * 用 `createConfig({ markdown: { frontmatterParser } })` 换成自己的实现。
 *
 * @param {string} raw 原始 Markdown
 * @returns {{ body: string, data: object }}
 */
export function parseFrontmatter(raw) {
  const source = stripBom(raw);
  const lines = source.split('\n');
  const end = frontmatterEnd(lines);
  const body = end < 0 ? source : lines.slice(end + 1).join('\n');
  if (end < 0) return { body, data: {} };

  const block = lines.slice(1, end).map((line) => line.replace(/\r$/, ''));
  try {
    return { body, data: parseBlock(block, 0, 0).value };
  } catch {
    // 解析失败不影响正文渲染
    return { body, data: {} };
  }
}
