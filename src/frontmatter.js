const BOM = '\uFEFF';

// 仅剥离文件顶部结构有效的 frontmatter：不解析 YAML、不做语义校验、不改动正文
export const stripFrontmatter = (raw) => {
  const source = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const lines = source.split('\n');

  // 首行必须是顶格 `---`（允许行尾空白与 CR）；前面有空行或空格都不算
  if (!/^---[ \t]*\r?$/.test(lines[0])) return source;

  // 结束行必须是顶格 `---` 或 `...`（YAML 文档结束符）；找不到则不剥离
  for (let i = 1; i < lines.length; i += 1) {
    if (/^(?:---|\.\.\.)[ \t]*\r?$/.test(lines[i])) {
      return lines.slice(i + 1).join('\n');
    }
  }

  return source;
};
