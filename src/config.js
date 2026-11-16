// Markdown 渲染配置：宿主壳是唯一注入点，渲染层只读 config，不猜宿主环境。
// 与 mdoc 侧 utils/markdown-config.js 同 schema（此处为 esm 预设），阶段 2 抽包后合并为 mdi2esm/src/config.js。

// 容器提示文案：VitePress 官方 locales[].container 的中英文默认值
export const CONTAINER_LABELS = {
  en: {
    tipLabel: 'TIP',
    infoLabel: 'INFO',
    warningLabel: 'WARNING',
    dangerLabel: 'DANGER',
    detailsLabel: 'Details',
    noteLabel: 'NOTE',
    importantLabel: 'IMPORTANT',
    cautionLabel: 'CAUTION',
  },
  zh: {
    tipLabel: '提示',
    infoLabel: '信息',
    warningLabel: '警告',
    dangerLabel: '危险',
    detailsLabel: '详细信息',
    noteLabel: '注意',
    importantLabel: '重要',
    cautionLabel: '小心',
  },
};

// 复制按钮文案：VitePress 官方 locales[].codeCopyButton
export const COPY_LABELS = {
  en: { tooltipText: 'Copy code', copiedText: 'Copied' },
  zh: { tooltipText: '复制代码', copiedText: '已复制' },
};

// schema 一次定型；字段在 1c-1d 分批接入渲染层
export const DEFAULT_CONFIG = {
  locale: 'zh',
  outline: [2, 3],
  base: '/',
  assetPrefix: '',
  libPath: '/lib/',
  docRoot: '/',
  themeBase: '/',
  // 图标组件：true = 内置异步 Icon，false = 不注册（用宿主全局 Icon），
  // 对象/函数 = 直接用该组件定义
  icons: true,
  markdown: { lineNumbers: false, math: true, container: [] },
};

// 宿主适配器：渲染层只做通用处理（外链、锚点归一化、路径解析），URL 拼装交给宿主预设。
// esm 预设；mdoc 预设见 markdown-config.js，阶段 2 合并为包的 presets。
export const DEFAULT_ADAPTERS = {
  toHref: ({ path, resolved, hash }) => {
    const isDoc = /\.md$/i.test(path) || !/\.[a-z0-9]+$/i.test(path);
    return `/${isDoc ? resolved.replace(/\.md$/i, '') : resolved}${hash}`;
  },
  toSrc: ({ src, resolved }) => (src.startsWith('/') ? src : `/${resolved}`),
  anchorHref: (slug) => `#${slug}`,
  toScriptImport: ({ spec, resolved }) => (spec.startsWith('.') ? `/${resolved}` : spec),
  scriptContext: ({ frontmatter, params }) => ({ frontmatter: frontmatter ?? {}, params: params ?? {} }),
  // KaTeX CSS：esm 由组件样式全局载入，无需运行时注入（返回 null）
  katexCss: () => null,
};

const localeKey = (locale) =>
  String(locale ?? '')
    .toLowerCase()
    .startsWith('en')
    ? 'en'
    : 'zh';

// 合并宿主覆盖：locale 决定默认文案，宿主可用 labels / adapters 覆盖整套预设
export function createConfig(overrides = {}) {
  const locale = overrides.locale ?? DEFAULT_CONFIG.locale;
  const key = localeKey(locale);
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    locale,
    markdown: { ...DEFAULT_CONFIG.markdown, ...overrides.markdown },
    labels: {
      container: overrides.labels?.container ?? CONTAINER_LABELS[key],
      copy: overrides.labels?.copy ?? COPY_LABELS[key],
    },
    adapters: { ...DEFAULT_ADAPTERS, ...overrides.adapters },
  };
}

// 把配置展开成 md.render 的 env：规则回调一律从 env 取值，避免模块级可变单例。
// 未传 config 时用默认配置，保证 renderMarkdown(src) 这类直接调用可用
export function createRenderEnv(config = createConfig(), page = {}) {
  return {
    ...page,
    config,
    adapters: config.adapters,
    containerLabels: config.labels.container,
    copyLabels: config.labels.copy,
    headings: [],
  };
}

// esm 预设：根部署，KaTeX 由组件样式全局载入（katexCss 返回 null）
export function createEsmAdapters() {
  return DEFAULT_ADAPTERS;
}

// mdoc 预设：带 BASE 的嵌套部署，资源走 /public，KaTeX CSS 按 LIB_PATH 注入
export function createMdocAdapters({ base = '/', libPath = '/lib/' } = {}) {
  const PUBLIC_ASSET_RE = /\.(svg|png|jpe?g|gif|webp|mp4|webm|avif|ico|woff2?)(?:[?#]|$)/i;
  const toPublicSrc = (src) => {
    if (!src || !src.startsWith('/')) return src;
    if (/^(https?:|mailto:|#)/i.test(src)) return src;
    if (src.startsWith(base)) src = src.slice(base.length - 1);
    if (src.startsWith('/public/')) src = src.slice('/public'.length);
    else if (src.startsWith('/assets/')) src = src.slice('/assets'.length);
    if (!PUBLIC_ASSET_RE.test(src)) return src;
    return base.slice(0, -1) + '/public' + src;
  };
  const toRoute = (p) => {
    const noExt = p.replace(/\.md$/i, '');
    if (noExt.toLowerCase() === 'index') return '/';
    if (noExt.toLowerCase().endsWith('/index')) return '/' + noExt.slice(0, -'index'.length);
    return '/' + noExt;
  };
  return {
    toHref: ({ path, resolved, hash }) =>
      /\.(md|html)$/i.test(path)
        ? base.slice(0, -1) + toRoute(resolved.replace(/\.(md|html)$/i, '')) + hash
        : base + resolved + hash,
    toSrc: ({ src, resolved }) => toPublicSrc(src.startsWith('/') ? src : base + resolved),
    anchorHref: (slug) => `#${slug}`,
    toScriptImport: ({ spec, resolved }) => {
      if (spec.startsWith('.')) return base + resolved;
      if (spec.startsWith('/')) return base.slice(0, -1) + spec;
      return spec;
    },
    scriptContext: ({ frontmatter, params }) => ({ frontmatter: frontmatter ?? {}, params: params ?? {} }),
    katexCss: () => libPath + 'katex/katex.min.css',
  };
}
