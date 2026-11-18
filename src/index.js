// mdi2esm 公共 API：宿主只从这里引用渲染能力，内部步骤不对外暴露
export { createConfig } from './config.js';
export { highlightBlock } from './highlight-block.js';
export { default as md } from './markdown-it.js';
export { createMarkdownComponent } from './pipeline.js';
export { buildOutline, renderMarkdown } from './render.js';
