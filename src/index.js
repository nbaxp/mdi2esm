// mdi2esm 公共 API：浏览器侧经 importmap 或打包器引用本包，node 测试直接 import 这里的源码
export { applyCodeBlock, maskFenceMarkers, unmaskFenceMarkers } from './code-block.js';
export {
  CONTAINER_LABELS,
  COPY_LABELS,
  createBaseAdapters,
  createConfig,
  createRenderEnv,
  DEFAULT_ADAPTERS,
  DEFAULT_CONFIG,
} from './config.js';
export { parseFrontmatter, stripFrontmatter } from './frontmatter.js';
export { highlightCode, normalizeLang } from './highlight.js';
export { highlightBlock } from './highlight-block.js';
export { mountImageZoom } from './image-zoom.js';
export {
  ensureCustomContainers,
  ensureEmojiPlugin,
  ensureSyntaxPlugins,
  default as md,
  render as renderSource,
} from './markdown-it.js';
// 兼容旧 mdoc 的 `import md from 'markdown-md.js'`（默认导出）写法
export { default } from './markdown-it.js';
export {
  anchorHref,
  applyLineNumbers,
  applyRestoreEntities,
  applyTablePlugin,
  escapeHtml,
  fenceMetaAttrs,
  normalizeHash,
} from './markdown-plugins.js';
export { buildScriptModuleSource, buildSetupModuleSource, createScriptModule, createSetup } from './markdown-script.js';
// 客户端标签入口 <MarkdownContent> 是 SFC，只经 index.full.js 进产物：
// 这里是 node 测试直接用 node 加载的入口，不能出现 .vue
export { renderMath } from './math.js';
export { MermaidBlock } from './mermaid.js';
export { createMarkdownComponent, extractTopLevelBlocks } from './pipeline.js';
export { buildOutline, escapeInvalidInterpolations, renderMarkdown, resolvePath } from './render.js';
// Prism 本体：宿主需要注册额外语法或直接用 Prism.highlight 时使用
export { default as Prism } from 'prismjs';
