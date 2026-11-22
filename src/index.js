// mdi2esm 公共 API：宿主只从这里引用渲染能力，内部步骤不对外暴露
export { highlightBlock } from './code-block-component.js';
export { assertConfigCompatible, createConfig } from './config.js';
export { ensureEmojiPlugin as ensureMarkdownReady, default as md } from './markdown-it.js';
export { createMarkdownComponent } from './pipeline.js';
export { buildOutline, renderMarkdown } from './render.js';
export { expandSource } from './source-expander.js';
