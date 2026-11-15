# mdi2esm

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

## 用法

打包器（Vite / Rollup）：

```js
import { renderMarkdown, renderMath, buildOutline, createConfig } from 'mdi2esm';

const config = createConfig();
const { html, headings } = renderMarkdown('# 标题\n正文', { config });
const finalHtml = await renderMath(html, config);
const outline = buildOutline(headings);
```

`package.json` 的 `exports` 提供两个入口：默认（生产）指向压缩版 `dist/index.min.js`，`development` 条件指向未压缩的 `dist/index.js`；也可显式用 `mdi2esm/index` 与 `mdi2esm/index.min`。

## 样式

渲染产物的类名沿用 VitePress 风格（`.vp-doc`、`.custom-block` 等），本包不附带样式，需自行提供。

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

`renderMarkdown(source, { dir, config })` 返回 `{ html, headings }`；`renderMath(html, config)` 异步返回注入 KaTeX 后的 HTML；`buildOutline(headings)` 生成树形大纲。

## 开发

```sh
npm install          # 安装依赖
npm run build        # 构建 dist/index.js 与 dist/index.min.js
npm run sync         # 把 src 同步到宿主 esm / mdoc 的 lib 副本（仓库内使用）
npm test             # 运行 node:test 测试
npm run lint         # eslint 检查（--max-warnings 0）
npm run lint:fix     # eslint 自动修复
```

构建使用 Vite 8（rolldown 打包）。关于本包在 esm / mdoc 宿主中的同步与 import map 约定，见仓库内 `scripts/sync.js`。

## 发布说明

`package.json` 中的 `repository` / `homepage` / `bugs` 指向 `https://github.com/nbaxp/mdi2esm`。

发布由 `.github/workflows/publish.yml` 承载：推送 `v*` Tag（或手动选择 `v*` Tag 且 `dry_run=false`）时，校验 Tag 与 `package.json` 版本一致，执行测试、lint、构建、`npm pack`、`npm publish <tgz>` 并创建 GitHub Release；手动触发默认只做 `npm publish --dry-run`。`dist` 被 gitignore、由 `npm run build` 生成，无需提交。

### 首次发布（新包）

CI 的 `npm publish` 走 OIDC Trusted Publisher，但**新包尚未发布时，npm 侧没有 Settings 页面，无法预先配置 Trusted Publisher**。因此首次推 Tag 会在 Publish 步骤返回 `404 Not Found`（不是包内容问题，前面测试/lint/build/pack 都会通过）。首次发布须按顺序：

1. 本地构建并打包：`npm run build && npm pack`，得到 `mdi2esm-<version>.tgz`。
2. 本地用 2FA OTP 发首版：`npm publish mdi2esm-<version>.tgz --access public --otp=<OTP>`。
3. 包发布后，到 https://www.npmjs.com/package/mdi2esm/settings/access → Trusted Publisher → GitHub Actions，填 owner `nbaxp`、repo `mdi2esm`、workflow `publish.yml` 保存。
4. 之后推 `v*` Tag 即可由 CI 用 OIDC 自动发布，无需 OTP。

### 后续发版

1. 确认 `npm test`、`npm run lint` 全过。
2. `npm version patch` / `minor` / `major` 更新版本并打同名 Tag（如 `v0.1.2`）。
3. 提交改动、推送 `main` 与 Tag；工作流自动完成构建、发布与 Release。
