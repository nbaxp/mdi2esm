// demo 是独立工作区：依赖全部装在 demo/node_modules（mdi2esm 通过 file:.. 安装），
// npm2esm 的产物直接写回 demo 根目录，由 demo/index.html 通过 importmap 加载。
// 这里列出的就是浏览器运行时真正需要的包，库自身的实现依赖已内联进 dist，不必出现。
export default {
  output: '.',
  lib: 'lib',
  // ./ 开头：条目值相对文档 base 解析，demo 放在任意子路径下都能跑
  urlBase: './lib/',
  packages: {
    // 已构建好的浏览器 ESM，原样复制；dist 里的 peer 裸导入交给 importmap 解析
    mdi2esm: [
      { copy: true, from: 'dist/index.min.js', to: 'index.min.js' },
      { copy: true, from: 'dist/index.min.css', to: 'index.min.css' },
    ],
    // 运行时要用完整版 Vue：md 会被编译成模板字符串，vue 的默认入口是 runtime 版，没有 compile
    vue: {
      from: 'dist/vue.esm-bundler.js',
      define: { 'process.env.NODE_ENV': '"production"' },
    },
    '@iconify/vue': { from: 'dist/iconify.mjs' },
    katex: [
      { from: 'dist/katex.mjs', to: 'index.min.js' },
      { copy: true, from: 'dist/katex.min.css', to: 'katex.min.css' },
      // CSS 内以 fonts/ 相对引用，只留 woff2
      { copy: true, from: 'dist/fonts/KaTeX_*.woff2', to: 'fonts' },
    ],
    // dist 已是浏览器 ESM，原样复制
    'medium-zoom': { copy: true, from: 'dist/medium-zoom.esm.js', to: 'medium-zoom.esm.js', importmap: true },

    // ---------------------------------------------------------------------
    // mermaid 的第三方依赖：按包外置，各自出独立产物。
    // @mermaid-js/parser 是 mermaid 自己的语法包，不外置，仍内联在 mermaid 产物里。
    // ---------------------------------------------------------------------
    // 只外置 mermaid 的 20 个运行时直接依赖：22 个 dependencies 中排除纯类型的
    // @types/d3 和 mermaid 自有的 @mermaid-js/parser，不递归外置间接依赖。
    // @chevrotain/* 不外置：mermaid 只导入聚合包 chevrotain，子包已在其中。
    mermaid: {
      external: [
        'elkjs/*',
        'cytoscape',
        'katex',
        'd3',
        'd3-sankey',
        'chevrotain',
        'marked',
        'dagre-d3-es/*',
        'dompurify',
        'roughjs',
        'cytoscape-fcose',
        '@upsetjs/venn.js',
        'dayjs',
        'dayjs/*',
        'khroma',
        'es-toolkit/*',
        '@iconify/utils',
        '@braintree/sanitize-url',
        'ts-dedent',
        'cytoscape-cose-bilkent',
        'stylis',
      ],
    },
    // CJS，转 ESM；保留 lib/ 子路径以便 importmap 前缀映射
    elkjs: { from: 'lib/elk.bundled.js', to: 'lib/elk.bundled.js' },
    cytoscape: {},
    stylis: {},
    d3: {},
    chevrotain: {},
    'd3-sankey': {},
    marked: {},
    // mermaid 只引这两个深层路径，importmap 走 dagre-d3-es/ 前缀
    'dagre-d3-es': [
      { from: 'src/dagre/index.js', to: 'src/dagre/index.js' },
      { from: 'src/graphlib/index.js', to: 'src/graphlib/index.js' },
    ],
    dompurify: { from: 'dist/purify.es.mjs' },
    roughjs: {},
    // peer cytoscape 由 npm2esm 自动外部化，共用 lib/cytoscape
    'cytoscape-fcose': {},
    'cytoscape-cose-bilkent': {},
    '@upsetjs/venn.js': {},
    // 插件是 CJS 且 require('dayjs')，外部化后共用 lib/dayjs
    dayjs: [
      { from: 'dayjs.min.js' },
      { from: 'plugin/advancedFormat.js', to: 'plugin/advancedFormat.js', external: ['dayjs'] },
      { from: 'plugin/customParseFormat.js', to: 'plugin/customParseFormat.js', external: ['dayjs'] },
      { from: 'plugin/duration.js', to: 'plugin/duration.js', external: ['dayjs'] },
      { from: 'plugin/isoWeek.js', to: 'plugin/isoWeek.js', external: ['dayjs'] },
    ],
    khroma: {},
    // mermaid 只引 es-toolkit/compat，importmap 里用精确条目（见 importmap.template.js）
    'es-toolkit': [{ from: 'dist/compat/index.mjs', to: 'compat/index.js' }],
    '@iconify/utils': {},
    // 包本身只有 CJS，具名导出由 entries 里的包装入口补上
    '@braintree/sanitize-url': [{ from: '../../../entries/sanitize-url.js' }],
    'ts-dedent': { from: 'esm/index.js' },
    // markdown-it-emoji / vue-style-runtime 走自动策略；vue-style-runtime 的 peer（vue）自动外部化
  },
};
