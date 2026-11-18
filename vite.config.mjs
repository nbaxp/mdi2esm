// Vite 配置：dev / preview / build 三种场景共用同一份插件与别名。
//
// - dev（`npm run dev`）：服务根目录 index.html，内联脚本里的裸导入由 Vite 重写，
//   'mdi2esm' 经 alias 落到 src/index.full.js——引用全是非 dist 内容。
// - build（scripts/build.mjs 调 JS API）：库构建 + demo 页面构建，同样走这里的别名与插件。
// - preview（`npm run preview`）：服务 dist——构建后的 demo 已自包含（无 importmap、
//   无需 node_modules），端口语 4180（4173 是 mdoc 的）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// 插件 + 别名工厂：build.mjs 里每轮构建各取一份新实例，避免插件状态串场
export const createBaseConfig = () => ({
  plugins: [vue()],
  resolve: {
    alias: {
      // 运行时要用完整版 Vue（含模板编译器）：md 会编译成模板字符串，runtime 版没有
      // compile()，MarkdownContent 会直接挂在 "compile is not a function"（见 README）。
      vue: 'vue/dist/vue.esm-bundler.js',
      // demo 与包消费方写法一致：import 'mdi2esm'。dev 与 demo 构建都指向源码入口
      // （含 SFC 的 MarkdownContent）；库构建不 import 自己，不受影响。
      mdi2esm: path.resolve(root, 'src/index.full.js'),
    },
  },
  optimizeDeps: {
    // mermaid 纯 ESM 且体积大，预打包冷启动很慢；排除后 dev 按源码直接服务
    exclude: ['mermaid'],
  },
});

export default defineConfig({
  ...createBaseConfig(),
  base: './', // demo 以相对路径引资产，gh-pages 任意子路径都能跑
  server: {
    port: 4180, // 4173 是 Vite 默认端口，本地常年被 mdoc 占着
    strictPort: false,
  },
  preview: {
    port: 4180,
    strictPort: false,
  },
});
