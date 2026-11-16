// mdi2esm 公共 API：esm 与 mdoc 统一经 importmap 引用此包（浏览器），
// node 测试则经各自前端 lib/mdi2esm 副本引用（以复用宿主 node_modules）。
export {
  CONTAINER_LABELS,
  COPY_LABELS,
  createConfig,
  createEsmAdapters,
  createMdocAdapters,
  createRenderEnv,
  DEFAULT_ADAPTERS,
  DEFAULT_CONFIG,
} from './config.js';
export { ensureCustomContainers, default as md, render as renderSource } from './markdown-it.js';
// 兼容旧 mdoc 的 `import md from 'markdown-md.js'`（默认导出）写法
export { applyCodeBlock, maskFenceMarkers, unmaskFenceMarkers } from './code-block.js';
export { stripFrontmatter } from './frontmatter.js';
export { highlightCode, normalizeLang } from './highlight.js';
export { mountImageZoom } from './image-zoom.js';
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
export { renderMath } from './math.js';
export { mountMermaid } from './mermaid.js';
export { createMarkdownComponent, extractTopLevelBlocks } from './pipeline.js';
export { buildOutline, escapeInvalidInterpolations, renderMarkdown, resolvePath } from './render.js';
