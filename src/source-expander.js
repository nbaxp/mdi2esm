// 浏览器端展开 VitePress 的 <<< / @include 指令：静态文件全部经 fetch 读取，
// 在同步 md.render() 之前把源文本展开成普通 Markdown，渲染链本身保持同步。
// 语法与正则移植自官方 snippet.ts / include.ts（v2.0.0-alpha.21）。
// 移植自 mdoc 的 templates/_site/utils/source-expander.js：把宿主的 BASE 改为从配置读 base，
// md 用库内实例；其余逻辑（region / 标题锚点 / rebase marker / 循环检测）保持一致。
import md from './markdown-it.js';
import { dedent, findRegions, stripRegionMarkers } from './markdown-regions.js';
import { createResourceResolver, defaultFetcher, isExternal, normalizeBase, resolvePath } from './url.js';

// 只剥离文件顶部结构有效的 frontmatter：不解析 YAML、不做语义校验、不改动正文
function stripFrontmatter(raw) {
  const source = raw.startsWith('\uFEFF') ? raw.slice(1) : raw;
  const lines = source.split('\n');
  // 首行必须是顶格 `---`（允许行尾空白与 CR）；前面有空行或空格都不算
  if (!/^---[ \t]*\r?$/.test(lines[0])) return source;
  // 结束行必须是顶格 `---` 或 `...`（YAML 文档结束符）；找不到则不剥离
  for (let i = 1; i < lines.length; i += 1) {
    if (/^(?:---|\.\.\.)[ \t]*\r?$/.test(lines[i])) return lines.slice(i + 1).join('\n');
  }
  return source;
}

const SNIPPET_RE = /^ {0,3}<<<(.*)$/;
const INCLUDE_RE = /<!--\s*@include:\s*(.*?)\s*-->/g;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)/;
const TITLE_RE = /\s*\[(.+)\]$/;
const SNIPPET_REGION_RE = /#([\w.-]+)$/;
const INCLUDE_REGION_RE = /#([^\s{]+)$/;
const RANGE_RE = /\{(\d*),(\d*)\}$/;
const SEPARATOR_RE = /[\\/]/;
const EXTENSION_RE = /\.([a-zA-Z0-9]+)$/;
const LINES_RE = /^\d+(?:[,-]\d+)*$/;

const cache = new Map();

// 失败时从缓存移除，避免一次网络故障被永久缓存、重试永远失败
export function clearSourceCache() {
  cache.clear();
}

function loadText(ctx, url) {
  if (!cache.has(url)) {
    const pending = ctx.fetcher(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return cache.get(url);
}

function warn(ctx, message) {
  if (ctx.onResolveError) ctx.onResolveError(message);
  else console.warn(`[mdi2esm] ${message}`);
}

const dirOf = (file) => file.slice(0, file.lastIndexOf('/') + 1);

// @/ 指向站点根，其余按当前文件的物理目录解析；最终 URL 由统一资源解析器产出。
function resolveTarget(spec, currentFile, ctx) {
  let file;
  if (isExternal(spec)) file = spec;
  else if (spec.startsWith('@')) file = spec.slice(SEPARATOR_RE.test(spec[1]) ? 2 : 1);
  else file = resolvePath(dirOf(currentFile), spec);
  // 外链（含 //）直接由解析器原样返回，base 不再参与
  return { file, url: ctx.resolveResource({ file, spec, kind: 'source' }) };
}

// snippet.ts:153-178
function parseSnippetMeta(meta) {
  let lines = '';
  let lang = '';
  let attrs = '';
  if (!meta) return { lines, lang, attrs };
  if (/^[\d\s,-]+$/.test(meta)) {
    const collapsed = meta.replace(/\s+/g, '');
    if (LINES_RE.test(collapsed)) return { lines: collapsed, lang, attrs };
  }
  const first = /^\S+/.exec(meta)?.[0] ?? '';
  if (LINES_RE.test(first)) {
    lines = first;
    meta = meta.slice(first.length).trimStart();
  }
  const langMatch = /^\S+/.exec(meta);
  if (langMatch) {
    lang = langMatch[0];
    attrs = meta.slice(langMatch[0].length).trim();
  }
  return { lines, lang, attrs };
}

// snippet.ts:107-151：path[#region][{[lines] [lang] [attrs...]}][ [title]]
function parseSnippetPath(raw) {
  let rest = raw.trim();
  let title = '';
  const titleMatch = TITLE_RE.exec(rest);
  if (titleMatch) {
    title = titleMatch[1];
    rest = rest.slice(0, titleMatch.index).trimEnd();
  }
  let lines = '';
  let lang = '';
  let attrs = '';
  const braceStart = rest.lastIndexOf('{');
  if (rest.endsWith('}') && braceStart > 0) {
    ({ lines, lang, attrs } = parseSnippetMeta(rest.slice(braceStart + 1, -1).trim()));
    rest = rest.slice(0, braceStart).trimEnd();
  }
  let region = '';
  const regionMatch = SNIPPET_REGION_RE.exec(rest);
  if (regionMatch) {
    region = regionMatch[1];
    rest = rest.slice(0, regionMatch.index);
  }
  const filepath = rest.trim();
  const filename = filepath.split(SEPARATOR_RE).pop() ?? '';
  const extension = EXTENSION_RE.exec(filename)?.[1] ?? '';
  return { filepath, extension, region, lines, lang, attrs, title: title || filename };
}

// 生成的围栏必须比文件内容里最长的反引号串更长，避免把内容截断
function fenceFor(code) {
  let max = 2;
  for (const match of code.matchAll(/`+/g)) max = Math.max(max, match[0].length);
  return '`'.repeat(max + 1);
}

async function expandSnippet(raw, currentFile, ctx) {
  const parsed = parseSnippetPath(raw);
  if (!parsed.filepath) return null;
  const { url } = resolveTarget(parsed.filepath, currentFile, ctx);
  let content;
  try {
    content = await loadText(ctx, url);
  } catch (err) {
    warn(ctx, `代码片段加载失败：${url}（${err.message}），保留原指令`);
    return null;
  }
  let lines = content.replace(/\r\n/g, '\n').split('\n');
  let matched;
  if (parsed.region) {
    const regions = findRegions(lines, parsed.region);
    if (regions.length === 0) {
      warn(ctx, `代码片段 region "${parsed.region}" 不存在：${url}，保留原指令`);
      return null;
    }
    lines = regions.flatMap((r) => lines.slice(r.start, r.end));
    matched = [...new Set(regions.map((r) => r.marker))];
  }
  if (parsed.region) {
    lines = stripRegionMarkers(lines, matched);
    lines = dedent(lines);
  }
  const lang = parsed.lang || parsed.extension;
  const info = (
    `${lang}${parsed.lines ? ` {${parsed.lines}}` : ''}` +
    `${parsed.attrs ? ` ${parsed.attrs}` : ''}${parsed.title ? ` [${parsed.title}]` : ''}`
  ).trim();
  const fence = fenceFor(lines.join('\n'));
  return `${fence}${info}\n${lines.join('\n')}\n${fence}`;
}

// include.ts:190-221：editor region 没命中时按标题锚点截取章节
function findHeadingSection(content, anchor) {
  const headings = md.parse(content, {}).filter((t) => t.type === 'heading_open' && t.map);
  const idx = headings.findIndex((t) => t.attrGet('id') === anchor);
  const heading = headings[idx];
  if (!heading) return null;
  let end;
  const level = parseInt(heading.tag.slice(1), 10);
  for (let i = idx + 1; i < headings.length; i += 1) {
    if (parseInt(headings[i].tag.slice(1), 10) <= level) {
      end = headings[i].map[0];
      break;
    }
  }
  return { start: heading.map[1], end };
}

async function expandInclude(raw, currentFile, ancestors, inFence, isOwnLine, ctx) {
  let spec = raw;
  const range = RANGE_RE.exec(spec);
  if (range) spec = spec.slice(0, range.index);
  const region = INCLUDE_REGION_RE.exec(spec);
  if (region) spec = spec.slice(0, region.index);
  spec = spec.trim();
  if (!spec) return null;
  const { file, url } = resolveTarget(spec, currentFile, ctx);
  // 只沿祖先链判环：兄弟节点仍可重复包含同一文件
  if (file === currentFile || ancestors.includes(file)) return null;
  let content;
  try {
    content = await loadText(ctx, url);
  } catch (err) {
    warn(ctx, `Include 文件加载失败：${url}（${err.message}），保留原指令`);
    return null;
  }
  // 有 range 且无 region 时保留 frontmatter，让行号与源文件一致
  if (file.endsWith('.md') && (region || !range)) content = stripFrontmatter(content);
  let lines = content.replace(/\r\n/g, '\n').split('\n');
  if (region) {
    const regions = findRegions(lines, region[1]);
    if (regions.length > 0) {
      lines = regions.flatMap((r) => lines.slice(r.start, r.end));
    } else {
      const section = findHeadingSection(content, region[1]);
      if (!section) {
        warn(ctx, `Include region 或标题 "${region[1]}" 不存在：${url}，保留原指令`);
        return null;
      }
      lines = lines.slice(section.start, section.end);
    }
  }
  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 1;
    const end = range[2] ? parseInt(range[2], 10) : lines.length;
    if (start < 1 || end < start || end > lines.length) {
      warn(ctx, `Include 范围 ${range[0]} 越界：${url}，保留原指令`);
      return null;
    }
    lines = lines.slice(start - 1, end);
  }
  const expanded = await processSource(lines.join('\n'), file, [...ancestors, currentFile], inFence, ctx);
  return file.endsWith('.md') && isOwnLine && !inFence
    ? `<!-- @include-start: ${dirOf(file)} -->\n\n${expanded}\n\n<!-- @include-end -->`
    : expanded;
}

async function processSource(src, currentFile, ancestors, fenced, ctx) {
  const lines = src.split('\n');
  const flags = [];
  let fence = null;
  for (const line of lines) {
    const match = FENCE_RE.exec(line);
    if (match) {
      if (fence === null) fence = match[1];
      else if (match[1].startsWith(fence) && !match[2].trim()) fence = null;
      flags.push(null);
      continue;
    }
    flags.push(fence === null ? 'outside' : 'inside');
  }
  const out = await Promise.all(
    lines.map(async (line, i) => {
      const status = flags[i];
      // snippet 是块级规则，只处理围栏外独占一行的 <<<
      if (status === 'outside') {
        const snippet = SNIPPET_RE.exec(line);
        if (snippet) return (await expandSnippet(snippet[1], currentFile, ctx)) ?? line;
      }
      if (!line.includes('<!--')) return line;
      const matches = [...line.matchAll(INCLUDE_RE)];
      if (!matches.length) return line;
      let result = '';
      let last = 0;
      for (const match of matches) {
        const isOwnLine = !line.slice(0, match.index).trim() && !line.slice(match.index + match[0].length).trim();
        const expanded = await expandInclude(
          match[1],
          currentFile,
          ancestors,
          fenced || status === 'inside',
          isOwnLine,
          ctx,
        );
        result += line.slice(last, match.index) + (expanded ?? match[0]);
        last = match.index + match[0].length;
      }
      return result + line.slice(last);
    }),
  );
  return out.join('\n');
}

/**
 * 把 <<< / @include 指令展开成普通 Markdown。
 * @param {string} source 源 Markdown
 * @param {string} sourcePath 当前文件的物理路径（相对站点根，决定相对路径基准）
 * @param {object} [options]
 * @param {string} [options.base='/'] 站点部署前缀，静态文件从 `${base}${file}` fetch
 * @param {object} [options.adapters] 宿主适配器：resolveResource / fetcher 可与渲染层共用
 * @param {function} [options.onResolveError] 加载/解析失败回调；给出后不再 console.warn
 * @returns {Promise<string>} 展开后的 Markdown
 */
export function expandSource(source, sourcePath = '', { base = '/', adapters, onResolveError } = {}) {
  const prefix = normalizeBase(base);
  const ctx = {
    resolveResource: adapters?.resolveResource ?? createResourceResolver(prefix),
    fetcher: adapters?.fetcher ?? defaultFetcher,
    onResolveError,
  };
  return processSource(stripFrontmatter(source), sourcePath, [], false, ctx);
}
