// 用 Vite 8（rolldown 打包，依赖里无 esbuild）构建 mdi2esm。产出：
//   dist/index.js      —— 完整打包版（未压缩，便于调试）
//   dist/index.min.js  —— 完整打包版（压缩，供生产使用）
//   dist/index.html    —— demo 页（包根 index.html 经 Vite 构建，自动 bundle 所有 peer，无需 importmap/vendor）
// 完整打包版内联 markdown 核心栈（markdown-it / @mdit* / @mdit-vue）；其余框架与重依赖
// （vue / vue-style-runtime / katex / mermaid / medium-zoom / shiki / @shikijs/transformers）外部化为 peer，
// 由消费方提供，避免重复实例与体积膨胀。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..'); // packages/mdi2esm

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const peerBare = ['vue', 'vue-style-runtime', 'katex', 'mermaid', 'medium-zoom', '@shikijs/transformers'];
const isExternal = (id) => peerBare.includes(id) || id === 'shiki' || id.startsWith('shiki/');
// 核心栈依赖（被内联）装在本包 node_modules，Vite 默认即可解析，无需 alias

async function main() {
  // 1) 库构建：完整打包版两个 flavor（未压缩 / 压缩），peer 外部化
  for (const [name, minify] of [
    ['index.js', false],
    ['index.min.js', 'oxc'],
  ]) {
    await build({
      configFile: false,
      logLevel: 'warn',
      build: {
        outDir: dist,
        emptyOutDir: false,
        target: 'es2020',
        minify,
        lib: {
          entry: path.join(root, 'src', 'index.full.js'),
          formats: ['es'],
          fileName: () => name,
        },
        rollupOptions: {
          external: isExternal,
          // 库产物须为单文件：禁用代码分割，内联所有动态 import（如 shiki-setup），
          // 否则会拆出相对 chunk，消费方 import 'mdi2esm' 时拿不到。
          output: { codeSplitting: false },
        },
      },
    });
  }

  // 2) demo 构建：标准 Vite 布局——包根 index.html 为入口，输出到 dist。
  //    index.html 从 ./dist/index.min.js、./src/styles/*.css 与 peer 引入，Vite 从本包 node_modules 解析并 bundle。
  await build({
    configFile: false,
    root,
    base: './',
    logLevel: 'warn',
    // demo 走 createMarkdownComponent，运行时用 compile() 编译 Markdown 生成的 template，
    // 必须 alias 到含完整编译器的构建（runtime 版 compile 是占位 stub，会抛错）。
    resolve: {
      alias: { vue: 'vue/dist/vue.esm-bundler.js' },
    },
    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    build: {
      outDir: dist,
      emptyOutDir: false,
      target: 'es2020',
      rollupOptions: { input: path.join(root, 'index.html') },
    },
  });

  console.log('built ->', path.relative(root, dist));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
