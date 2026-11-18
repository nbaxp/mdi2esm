// 完整打包版入口：仅导出 mdi2esm 公共 API（内部依赖由 full 内联，不对外重新导出）
export * from './index.js';
// 标签式组件是 SFC，由 Vite 的 @vitejs/plugin-vue 编成 render 函数进产物；
// 它不放进 index.js，是为了让 tests/ 里 `node --test` 直接 import src/index.js 时不碰 .vue
export { default as MarkdownContent } from './markdown-content.vue';
