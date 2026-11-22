// MdViewer 路径模型（PATH-REDESIGN-v8.md）的纯函数实现。
// 只做 URL 解析与四条公式：不依赖 vue-router，不映射物理文件，不读取宿主环境。
// 站点级配置（routerBase / docsRouterPath / docStaticPath / 语言集合）与当前页
// （lang / routeFullPath）都由宿主经 createConfig({ paths }) 注入。
import { isExternal } from './url.js';

// §1 配置默认值。langs 是宿主提供的「有效语言标识集合」，仅用于识别路由语言段，
// 不是 lang → 目录名的映射表（语言标识、URL 段、物理目录名三者已统一）。
export const DEFAULT_PATHS = {
  i18nEnabled: false,
  omitDefaultLang: true,
  urlTransformEnabled: true,
  routerBase: '/',
  docsRouterPath: '/docs',
  docStaticPath: '/content',
  defaultLang: 'zh-CN',
  langs: [],
  lang: null,
  routeFullPath: '/',
};

// join：去重复 `/`、规范 `.`、`..`，根 `/` 视为空段，结果以 `/` 开头；
// 最后一段以 `/` 结尾（目录）时保留尾斜杠。对应 v8 §3 对 join 的约定。
export function join(...segments) {
  const parts = [];
  let trailing = false;
  for (const value of segments) {
    if (value == null) continue;
    const seg = String(value);
    if (!seg) continue;
    const segParts = seg.split('/').filter((part) => part && part !== '.');
    // 纯 '/' / '.' 段视为空段（v8 §3：根 / 视为空段），不产生尾斜杠
    if (!segParts.length) continue;
    trailing = seg.endsWith('/');
    for (const part of segParts) {
      if (part === '..') parts.pop();
      else parts.push(part);
    }
  }
  const body = '/' + parts.join('/');
  return trailing && parts.length ? body + '/' : body;
}

// 归一化为「无尾斜杠前缀」：'/' → ''（表示 docsRouterPath 为站点根，特例不剥离）
const prefixOf = (value) => {
  const s = String(value ?? '').replace(/\/+$/, '');
  return s === '/' ? '' : s.startsWith('/') ? s : '/' + s;
};

// 分离 pathname / search / hash。query 与 hash 不参与分类与规范化（§5）。
export function splitUrl(raw) {
  const text = String(raw ?? '');
  const hashAt = text.indexOf('#');
  const hash = hashAt >= 0 ? text.slice(hashAt) : '';
  const beforeHash = hashAt >= 0 ? text.slice(0, hashAt) : text;
  const queryAt = beforeHash.indexOf('?');
  const search = queryAt >= 0 ? beforeHash.slice(queryAt) : '';
  const pathname = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  return { pathname, search, hash };
}

// 去除 .md 后缀并把 index 归一为目录，保留目录尾斜杠（§3 公式 2 + §5 第 2 条）。
function toDocRoutePath(resolvedPath) {
  const plain = resolvedPath.replace(/\.md$/i, '');
  if (/(?:^|\/)index$/i.test(plain)) {
    const dir = plain.replace(/(?:^|\/)index$/i, '');
    return dir ? dir + '/' : '/';
  }
  if (plain === '' || plain === '/') return '/';
  return plain;
}

// §4 第 1 步：routeFullPath 去掉 docsRouterPath（边界匹配；'/' 特例不剥离）。
function stripDocsRouterPath(routeFullPath, docsRouterPath) {
  let rest = String(routeFullPath ?? '/').split(/[?#]/)[0];
  if (!rest.startsWith('/')) rest = '/' + rest;
  const prefix = prefixOf(docsRouterPath);
  if (!prefix) return rest;
  if (rest === prefix) return '/';
  if (rest.startsWith(prefix + '/')) return rest.slice(prefix.length) || '/';
  return rest;
}

// §2 routeLang：i18nEnabled=false 或（省略默认语言且 lang=默认）时为空，否则为 lang。
function routeLangOf(cfg, lang) {
  if (!cfg.i18nEnabled) return '';
  if (cfg.omitDefaultLang && lang === cfg.defaultLang) return '';
  return lang;
}

// §4 第 2 步：语言段命中宿主提供的有效语言标识则取为当前语言并剥离，否则用默认语言。
// 语言段优先于文档首段；省略默认语言时只识别非默认语言。
function detectLang(rest, cfg) {
  if (!cfg.i18nEnabled) return { lang: cfg.defaultLang, stripped: false };
  const first = rest.split('/').filter(Boolean)[0];
  if (!first) return { lang: cfg.defaultLang, stripped: false };
  const candidates = cfg.omitDefaultLang ? cfg.langs.filter((l) => l !== cfg.defaultLang) : cfg.langs;
  if (candidates.includes(first)) return { lang: first, stripped: true };
  return { lang: cfg.defaultLang, stripped: false };
}

// §2 / §4：由路由推导当前页的 lang / routeLang / docPath / docDir / docFilePath。
function pageContext(cfg) {
  const rest = stripDocsRouterPath(cfg.routeFullPath, cfg.docsRouterPath);
  // 宿主显式给出的 lang 优先（v8 §2：lang 取自宿主 i18n）；缺省时才从路由推导。
  // 无论哪种，路由首段若是有效语言标识都要剥离（语言段优先于文档首段）。
  const detected = cfg.lang ? { lang: cfg.lang, stripped: false } : detectLang(rest, cfg);
  const candidates = cfg.omitDefaultLang ? cfg.langs.filter((l) => l !== cfg.defaultLang) : cfg.langs;
  const stripped = detected.stripped || candidates.includes(rest.split('/').filter(Boolean)[0]);
  const lang = detected.lang;
  const routeLang = routeLangOf(cfg, lang);
  let docPath = rest;
  if (stripped) docPath = rest.replace(/^\/[^/]+/, '') || '/';
  if (!docPath.startsWith('/')) docPath = '/' + docPath;
  const docDir = docPath.endsWith('/') ? docPath : docPath.slice(0, docPath.lastIndexOf('/') + 1) || '/';
  const docFilePath = docPath.endsWith('/') ? docPath + 'index' : docPath;
  return { lang, routeLang, docPath, docDir, docFilePath };
}

// §4 第 4 步：把链接 pathname 解析为文档逻辑绝对路径（相对基于 docDir，绝对基于文档根）。
function resolveDocPath(pathname, docDir) {
  return pathname.startsWith('/') ? join(pathname) : join(docDir, pathname);
}

/**
 * 创建 v8 路径解析器。返回的函数都只依赖构造时注入的配置与当前页上下文，
 * 可直接用于渲染适配器与宿主的 md fetch。
 *
 * @param {object} [options] 站点级 + 当前页配置，见 DEFAULT_PATHS
 * @returns {object} { config, context, resolve, sourceUrl, resolveResource, toScriptImport }
 */
export function createPathResolver(options = {}) {
  const cfg = { ...DEFAULT_PATHS, ...options };
  const ctx = pageContext(cfg);

  // §5 URL 转换：分类 + 四条公式。外链、协议相对、data/mailto/tel、纯片段原样返回；
  // query/hash 不参与分类与规范化，转换后原样拼回。
  const resolve = (raw) => {
    if (!cfg.urlTransformEnabled) return raw;
    const { pathname, search, hash } = splitUrl(raw);
    if (!pathname || isExternal(pathname)) return raw;

    const resolvedPath = resolveDocPath(pathname, ctx.docDir);
    let out;
    if (/\.md$/i.test(pathname)) {
      // 文档链接：只看 pathname，相对与根绝对同样处理；不含 routerBase。
      const routePath = toDocRoutePath(resolvedPath);
      out = join(cfg.docsRouterPath, ctx.routeLang, routePath);
      // §3：文档目录路由保留末尾 /（根文档为 /），join 把纯 / 段当空段，需在此补回。
      if (routePath.endsWith('/') && !out.endsWith('/')) out += '/';
    } else if (!pathname.startsWith('/')) {
      // 文档资源：相对 URL，走 docStaticPath，不含 lang。
      out = join(cfg.routerBase, cfg.docStaticPath, resolvedPath);
    } else {
      // 公共资源：根绝对 URL，只带 routerBase。
      out = join(cfg.routerBase, pathname);
    }
    return out + search + hash;
  };

  // §3 公式 1：md 源文件。宿主据此 fetch 当前文档。
  const sourceUrl = () => join(cfg.routerBase, cfg.docStaticPath, ctx.lang, ctx.docFilePath + '.md');

  // 库内 fetch（<<< / @include / 地图 GeoJSON）：静态资源统一走 docStaticPath；外链原样。
  // file 是由 source-expander 基于逻辑 sourcePath（不含 lang）算出的站点相对路径。
  const resolveResource = ({ file, spec }) => {
    const target = spec ?? file;
    if (isExternal(target)) return target;
    return join(cfg.routerBase, cfg.docStaticPath, file);
  };

  // <script> 相对导入：沿用 base 语义，前缀只认 routerBase。
  const toScriptImport = ({ spec, resolved }) => {
    if (isExternal(spec)) return spec;
    if (spec.startsWith('.')) return join(cfg.routerBase, resolved);
    if (spec.startsWith('/')) return join(cfg.routerBase, spec);
    return spec;
  };

  return { config: cfg, context: ctx, resolve, sourceUrl, resolveResource, toScriptImport };
}
