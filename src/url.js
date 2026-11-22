// URL 解析的唯一公共边界：base 归一、外链判定、站点相对路径 → 可 fetch URL。
// 渲染层的 toHref/toSrc 与库内 fetch（<<< / @include / 地图 GeoJSON）共用同一套规则，
// 避免历史上「两套 base 语义 + 三套外链正则」造成的漂移。

// base 归一为「无尾斜杠前缀」：'/'、''、null → ''；'/doc/' → '/doc'
export function normalizeBase(base) {
  if (base == null) return '';
  const trimmed = String(base).trim().replace(/\/+$/, '');
  return trimmed === '/' ? '' : trimmed;
}

// 前缀 + 站点根相对路径 → 绝对 URL 路径。空 base 也带前导 '/'，不发相对 fetch。
export function withBase(base, path) {
  const prefix = normalizeBase(base);
  const tail = String(path ?? '').replace(/^\/+/, '');
  return `${prefix}/${tail}`;
}

// 外链 / 协议 URL / data / blob / 协议相对：不由适配器改写
export function isExternal(spec) {
  return /^[a-z][a-z\d+.-]*:/i.test(spec) || spec.startsWith('//');
}

// 路径解析：'guide/./a.md' → 'guide/a.md'，处理 './' 与 '../'（含根前导斜杠归一）
export function resolvePath(base, rel) {
  const out = [];
  for (const part of (base + rel).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

// 库内 fetch 的默认资源解析器：外链原样，其余加 base 前缀。
// 宿主覆写时可读取 ctx.kind 区分 snippet / include / map 等来源。
export function createResourceResolver(base) {
  return ({ file, spec }) => {
    const target = spec ?? file;
    if (isExternal(target)) return target;
    return withBase(base, file);
  };
}

// 默认 fetcher（可被 config.adapters.fetcher 覆写，用于 SSR / 认证 / 测试）
export function defaultFetcher(url, init) {
  return fetch(url, init);
}
