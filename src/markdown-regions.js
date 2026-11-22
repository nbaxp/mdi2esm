// 移植自 VitePress src/node/markdown/regions.ts（v2.0.0-alpha.21）。
// VS Code folding markers 的跨语言超集，纯字符串处理，可在浏览器端直接使用。
// 本模块由 mdoc 的 templates/_site/utils/markdown-regions.js 移植进库。
const maybeMarkerRE = /region/i;
const quotedRE = /^"(.*)"$/;

// Visual Basic 的 `#Region "Name"` 会把引号带进捕获组，需要剥掉才能按名字引用
function unquote(name) {
  return quotedRE.exec(name)?.[1] ?? name;
}

export const markers = [
  // 行注释：js/ts/go/rust/java（# 可选），sql/bat（必须有 #）
  {
    start: /^\s*(?:\/\/\s*#?|(?:--|::|@?[rR][eE][mM])\s*#)region\b\s*(.*?)\s*$/,
    end: /^\s*(?:\/\/\s*#?|(?:--|::|@?[rR][eE][mM])\s*#)endregion\b\s*(.*?)\s*$/,
  },
  // # 注释：c#/coffeescript/python/yaml/shell/visual basic/powershell/c-c++
  {
    start: /^\s*#\s*(?:#\s*|pragma\s+)?[rR]egion\b\s*(.*?)\s*$/,
    end: /^\s*#\s*(?:#\s*|pragma\s+)?[eE]nd ?[rR]egion\b\s*(.*?)\s*$/,
  },
  // markdown（# 可选）、html（必须有 #）、vue template
  {
    start: /^\s*<!--\s*#?region\b\s*(.*?)\s*-->/,
    end: /^\s*<!--\s*#?endregion\b\s*(.*?)\s*-->/,
  },
  // css / less / scss
  {
    start: /^\s*\/\*\s*#region\b\s*(.*?)\s*\*\//,
    end: /^\s*\/\*\s*#endregion\b\s*(.*?)\s*\*\//,
  },
  // f# 块注释
  {
    start: /^\s*\(\*\s*#region\b\s*(.*?)\s*\*\)/,
    end: /^\s*\(\*\s*#endregion\b\s*(.*?)\s*\*\)/,
  },
  // json key
  {
    start: /^\s*"\/{2,}\s*#region\b\s*(.*?)":\s*"",?\s*$/,
    end: /^\s*"\/{2,}\s*#endregion\b\s*(.*?)":\s*"",?\s*$/,
  },
];

// 按名字找出全部 region，按文档顺序；跨注释风格可配对，嵌套同名取最外层
export function findRegions(lines, name) {
  const regions = [];
  const open = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!maybeMarkerRE.test(line)) continue;
    let isStart = false;
    for (const marker of markers) {
      const startName = marker.start.exec(line)?.[1];
      if (startName != null) {
        open.push({ name: unquote(startName), start: i + 1, marker });
        isStart = true;
        break;
      }
    }
    if (isStart || open.length === 0) continue;
    for (const marker of markers) {
      const rawEndName = marker.end.exec(line)?.[1];
      if (rawEndName == null) continue;
      const endName = unquote(rawEndName);
      // 具名 end 关闭同名的内层 region；匿名 end 只关闭同注释风格的内层 region
      const index = endName
        ? open.findLastIndex((r) => r.name === endName)
        : open.findLastIndex((r) => r.marker === marker);
      if (index === -1) continue;
      const [closed] = open.splice(index, open.length - index);
      if (closed.name === name && !open.some((r) => r.name === name)) {
        regions.push({ start: closed.start, end: i, marker: closed.marker });
      }
      break;
    }
  }
  return regions;
}

export function stripRegionMarkers(lines, styles = markers) {
  return lines.filter(
    (line) => !maybeMarkerRE.test(line) || !styles.some((m) => m.start.test(line) || m.end.test(line)),
  );
}

export function dedent(lines) {
  let minIndent = Infinity;
  for (const line of lines) {
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] !== ' ' && line[i] !== '\t') {
        minIndent = Math.min(i, minIndent);
        break;
      }
    }
    if (minIndent === 0) break;
  }
  if (minIndent === Infinity || minIndent === 0) return lines;
  return lines.map((line) => line.slice(minIndent));
}
