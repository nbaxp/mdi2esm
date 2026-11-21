// Vite 配置：dev / preview / build 三种场景共用同一份别名。
//
// - dev（`npm run dev`）：服务根目录 index.html，内联脚本里的裸导入由 Vite 重写，
//   'mdi2esm' 经 alias 落到 src/index.js——引用全是非 dist 内容。
// - build（scripts/build.mjs 调 JS API）：库构建 + demo 页面构建，同样走这里的别名。
// - preview（`npm run preview`）：服务 dist——构建后的 demo 已自包含（无 importmap、
//   无需 node_modules）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export const createBaseConfig = () => ({
  resolve: {
    alias: {
      // 运行时要用完整版 Vue（含模板编译器）：md 会编译成模板字符串，runtime 版没有
      // compile()（见 README）。
      vue: 'vue/dist/vue.esm-bundler.js',
      // demo 与包消费方写法一致：import 'mdi2esm'
      mdi2esm: path.resolve(root, 'src/index.js'),
    },
  },
});

export default defineConfig({
  ...createBaseConfig(),
  base: './', // demo 以相对路径引资产，gh-pages 任意子路径都能跑
});
