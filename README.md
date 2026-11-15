# markdown-rt

A markdown-it wrapper with common plugins integrated. It renders Markdown into VitePress-style HTML, with code highlighting, math (KaTeX), Mermaid diagrams, outlines and image zoom built in. The core markdown stack is bundled and ships as browser-native ESM; framework and heavy dependencies are left as peers for the host to provide.

## 环境要求

- Node.js >= 20（见 `package.json` 的 `engines`）。
- 浏览器侧运行，运行时需要宿主的 import map 或打包器解析 peer 依赖。

## 安装

```sh
npm i mdi2esm
```

同时安装 peer 依赖（用到哪些功能装哪些；完整能力需要全部）：

```sh
npm i mdi2esm vue vue-style-runtime shiki @shikijs/transformers katex mermaid medium-zoom
```

## 两种用法

### 1. 浏览器原生 ESM（import map）

产物是单文件 ESM，内部对 peer 使用裸包名导入，用 import map 指到浏览器可访问的路径即可：

```html
<script type="importmap">
  {
    "imports": {
      "vue": "/lib/vue/index.min.js",
      "shiki": "/lib/shiki/index.min.js",
      "katex": "/lib/katex/index.min.js",
      "mermaid": "/lib/mermaid/index.min.js",
      "medium-zoom": "/lib/medium-zoom/index.min.js",
      "mdi2esm": "/lib/markdown-rt/index.min.js"
    }
  }
</script>
<script type="module">
  import { renderMarkdown } from 'mdi2esm';
  const { html } = renderMarkdown('# 你好');
  document.body.innerHTML = html;
</script>
```

### 2. 打包器（Vite / Rollup）

```js
import { renderMarkdown, renderMath, buildOutline, createConfig } from 'mdi2esm';

const config = createConfig();
const { html, headings } = renderMarkdown('# 标题\n正文', { config });
const finalHtml = await renderMath(html, config);
const outline = buildOutline(headings);
```

`package.json` 的 `exports` 提供两个入口：默认（生产）指向压缩版 `dist/index.min.js`，`development` 条件指向未压缩的 `dist/index.js`；也可显式用 `mdi2esm/index` 与 `mdi2esm/index.min`。

## 样式

渲染产物的类名沿用 VitePress 风格（`.vp-doc`、`.custom-block` 等），样式由源文件 `src/styles/markdown-rt.css` 提供。请从源码引入并自行主题化（覆盖 `:root` 下的 `--vp-*` 变量）：

```js
import 'mdi2esm/src/styles/markdown-rt.css'; // 需打包器支持
```

KaTeX 的样式与字体属于 peer，由你安装的 `katex` 包提供，需自行引入：

```js
import 'katex/dist/katex.min.css';
```

## 公共 API

包入口导出以下能力（无需记忆内部模块路径）：

- 配置：`createConfig`、`createEsmAdapters`、`createMdocAdapters`、`DEFAULT_CONFIG`、`DEFAULT_ADAPTERS`、`CONTAINER_LABELS`、`COPY_LABELS`
- 渲染环境：`createRenderEnv`
- 渲染：`renderMarkdown`、`renderSource`、`renderMath`、`md`（markdown-it 实例）、`ensureCustomContainers`、`buildOutline`、`escapeInvalidInterpolations`、`resolvePath`
- 代码块：`applyCodeBlock`、`maskFenceMarkers`、`unmaskFenceMarkers`、`highlightCodeBlocks`
- 管线：`createMarkdownComponent`、`extractTopLevelBlocks`
- 其它：`stripFrontmatter`、`mountImageZoom`、`mountMermaid`、`VPBadge`
- 浏览器脚本模块：`createScriptModule`、`createSetup`、`buildScriptModuleSource`、`buildSetupModuleSource`
- Markdown 插件辅助：`anchorHref`、`normalizeHash`、`applyRestoreEntities`、`applyTablePlugin`、`applyLineNumbers`、`fenceMetaAttrs`、`escapeHtml`

`renderMarkdown(source, { dir, config })` 返回 `{ html, headings }`；`renderMath(html, config)` 异步返回注入 KaTeX 后的 HTML；`buildOutline(headings)` 生成树形大纲。完整可运行示例见仓库根目录的 `index.html`（demo 页）。

## 开发

```sh
npm install          # 安装依赖
npm run build        # 构建 dist/index.js、dist/index.min.js 与 demo 页到 dist/
npm run preview      # 预览 dist 里的 demo 页（vite preview）
npm run sync         # 把 src 同步到宿主 esm / mdoc 的 lib 副本（仓库内使用）
npm test             # 运行 node:test 测试
npm run lint         # eslint 检查（--max-warnings 0）
npm run lint:fix     # eslint 自动修复
```

构建使用 Vite 8（rolldown 打包）。关于本包在 esm / mdoc 宿主中的同步与 import map 约定，见仓库内 `scripts/sync.js`。

## 发布说明

`package.json` 中的 `repository` / `homepage` / `bugs` 指向 `https://github.com/nbaxp/mdi2esm`。

发布由 `.github/workflows/publish.yml` 承载：推送 `v*` Tag 时校验 Tag 与 `package.json` 版本一致，执行测试与 lint、构建、`npm pack`、`npm publish <tgz>`（npm OIDC Trusted Publisher，需在 npm 侧配置 GitHub Actions 为 Trusted Publisher）并创建 GitHub Release；手动触发默认只做 `npm publish --dry-run`，正式手动发布需选择 `v*` Tag 并将 `dry_run` 设为 `false`。

发版步骤：

1. 确认 `npm test`、`npm run lint` 全过。
2. 更新 `package.json` 的 `version`（如 `npm version patch` / `minor` / `major`）。
3. 提交并打同名 Tag（`v0.1.1` 形式）推送，工作流自动完成构建、发布与 Release。
