// 用 Vite 8（rolldown 打包，依赖里无 esbuild）构建 mdi2esm。产出：
//   dist/index.js         —— 完整打包版（未压缩，便于调试）
//   dist/index.min.js     —— 完整打包版（压缩，供生产使用）
//   dist/index.css        —— 库样式（未压缩）
//   dist/index.min.css    —— 库样式（压缩）
//   dist/index.html 等    —— demo 页面（Vite 应用构建产物，自包含，可直接发布 GitHub Pages）
// demo 构建与 dev 共用 vite.config.mjs 的插件与别名：index.html 里的 'mdi2esm' 打包为
// 同一份源码的产物（库本体另出 index.js/index.min.js 供 npm 包），所有依赖打进 dist，
// 无 importmap、无 node_modules 依赖。
// 完整打包版内联 markdown 核心栈（markdown-it / @mdit* / @mdit-vue）与 Prism；其余框架与重依赖
// （vue / vue-style-runtime / katex / mermaid / pele / echarts）外部化为 peer，
// 由消费方提供，避免重复实例与体积膨胀。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from 'lightningcss';
import { build } from 'vite';

import { createBaseConfig } from '../vite.config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..'); // 包根目录

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const peerBare = [
  '@iconify/vue',
  'vue',
  'vue-style-runtime',
  'katex',
  'mermaid',
  'pele',
  'echarts',
  'medium-zoom',
  'markdown-it-emoji',
];
const isExternal = (id) => peerBare.includes(id);
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
      // demo 的静态资源在后面步骤处理，这里不让 Vite 去复制 public/
      publicDir: false,
      plugins: [],
      build: {
        outDir: dist,
        emptyOutDir: false,
        target: 'es2020',
        minify,
        lib: {
          entry: path.join(root, 'src', 'index.js'),
          formats: ['es'],
          fileName: () => name,
        },
        rollupOptions: {
          external: isExternal,
          // 库产物须为单文件：禁用代码分割，内联所有动态 import（如 Prism 语言组件），
          // 否则会拆出相对 chunk，消费方 import 'mdi2esm' 时拿不到。
          output: { codeSplitting: false },
        },
      },
    });
  }

  // 2) 独立样式：src/styles/index.css → dist/index.css / dist/index.min.css（npm 包用）
  for (const [name, minify] of [
    ['index.css', false],
    ['index.min.css', true],
  ]) {
    const { code } = bundle({ filename: path.join(root, 'src', 'styles', 'index.css'), minify });
    fs.writeFileSync(path.join(dist, name), code);
  }

  // 3) demo 页面：Vite 应用构建。index.html 是入口，所有裸导入（'mdi2esm' 经 alias 指到
  //    源码）与 <link> 样式（含 KaTeX 字体）全部打进 dist，产物自包含。
  await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false, // public/ 原样拷贝即可，走第 4 步
    ...createBaseConfig(),
    base: './', // 相对路径引资产，gh-pages 任意子路径都能跑
    build: {
      outDir: dist,
      emptyOutDir: false,
      target: 'es2020',
      rollupOptions: {
        input: path.join(root, 'index.html'),
      },
    },
  });

  // 4) 运行时 fetch 的示例源与静态资源。示例源在 dist 里叫 demo.md：
  //    package.json 的 files 白名单按名字匹配会把 dist/README.md 也带进 npm 包，
  //    换名后根 README.md（包文档）进包、dist/demo.md（演示源）只留在 gh-pages 产物里。
  fs.copyFileSync(path.join(root, 'README.md'), path.join(dist, 'demo.md'));
  fs.cpSync(path.join(root, 'public'), path.join(dist, 'public'), { recursive: true });

  console.log('built ->', path.relative(root, dist));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
