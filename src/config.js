// Markdown 渲染配置：宿主壳是唯一注入点，渲染层只读 config，不猜宿主环境。

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

// 只有渲染层真正读取的字段才在这里：其余站点级路径（base / docRoot / themeBase 等）
// 属于宿主壳，包内不读，也就不该出现在默认配置里
export const DEFAULT_CONFIG = {
  locale: 'zh',
  // mark / sub / sup：`==高亮==`、`H~2~O`、`x^2^`，置 false 关闭
  markdown: {
    lineNumbers: false,
    math: true,
    mark: true,
    sub: true,
    sup: true,
    container: [],
    frontmatterParser: null,
  },
};

// 宿主适配器：渲染层只做通用处理（外链、锚点归一化、路径解析），
// URL 拼装只认 base 一个参数——根部署、子路径部署、mdoc 嵌套部署走同一条路。
// 有非标准规则时，宿主在自己的 adapters 里覆写单个函数，createConfig 负责合并。
export function createBaseAdapters(base = '/') {
  const root = base.endsWith('/') ? base : `${base}/`;
  const prefix = root.slice(0, -1); // '' 或 '/doc'
  return {
    toHref: ({ path, resolved, hash }) => {
      const isDoc = /\.md$/i.test(path) || !/\.[a-z0-9]+$/i.test(path);
      return `${prefix}/${isDoc ? resolved.replace(/\.md$/i, '') : resolved}${hash}`;
    },
    toSrc: ({ src, resolved }) => {
      if (/^[a-z]+:/i.test(src) || src.startsWith('//')) return src; // data: / 外链
      if (src.startsWith('/')) return `${prefix}${src}`;
      return `${prefix}/${resolved}`;
    },
    anchorHref: (slug) => `#${slug}`,
    toScriptImport: ({ spec, resolved }) => {
      if (spec.startsWith('.')) return `${prefix}/${resolved}`;
      if (spec.startsWith('/')) return `${prefix}${spec}`;
      return spec;
    },
    scriptContext: ({ frontmatter, params }) => ({ frontmatter: frontmatter ?? {}, params: params ?? {} }),
  };
}

// 根部署的适配器，作为渲染层没拿到 config 时的兜底
export const DEFAULT_ADAPTERS = createBaseAdapters('/');

const localeKey = (locale) =>
  String(locale ?? '')
    .toLowerCase()
    .startsWith('en')
    ? 'en'
    : 'zh';

// 合并宿主覆盖：base 在这里编成 adapters，配置对象上不出现 base 字段；
// locale 决定默认文案，宿主可用 labels / adapters 覆盖
export function createConfig({ base = '/', adapters, ...overrides } = {}) {
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
    adapters: { ...createBaseAdapters(base), ...adapters },
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
