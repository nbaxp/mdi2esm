# mdi2esm

A markdown-it wrapper with common plugins integrated. It renders Markdown into VitePress-style HTML, with code highlighting, math (KaTeX), Mermaid diagrams, outlines and image zoom built in. The core markdown stack and Prism are bundled into a single browser-ready ESM artifact; framework and heavy dependencies are left as peers for the host to provide.

## 环境要求

- Node.js >= 20（见 `package.json` 的 `engines`）。
- 浏览器侧运行，运行时需要宿主的 import map 或打包器解析 peer 依赖。

## 安装

```sh
npm i mdi2esm
```

同时安装 peer 依赖（用到哪些功能装哪些；完整能力需要全部）：

```sh
npm i mdi2esm vue vue-style-runtime katex mermaid medium-zoom
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

`package.json` 的 `exports` 提供两个 JS 入口：默认（生产）指向压缩版 `dist/index.min.js`，`development` 条件指向未压缩的 `dist/index.js`；也可显式用 `mdi2esm/index` 与 `mdi2esm/index.min`。

## 样式

渲染产物的类名沿用 VitePress 风格（`.vp-doc`、`.custom-block` 等）。包内附带一套只覆盖 markdown 正文与页内目录（`.vp-doc`、`.vp-doc-outline`）的样式：

```js
import 'mdi2esm/index.min.css';
```

也可用未压缩的 `mdi2esm/index.css`。这套样式不包含站点 header、sidebar、nav、搜索等布局，宿主可以在 `:root` / `.dark` 上覆盖 `--vp-*` 变量做主题定制。代码高亮由 Prism 生成 `token` 类，配色已包含在样式里；Prism 本身已内联，无需额外安装。

代码块支持的语言覆盖 TIOBE 前 20 中 Prism 有语法的部分（Scratch 除外），再加上文档常用语言：`python` `c` `cpp` `java` `csharp` `javascript` `visual-basic` `go` `sql` `pascal`（Delphi）`fortran` `r` `rust` `php` `matlab` `kotlin` `ruby` `swift` `nasm`（汇编），以及 `bash` `batch` `diff` `docker` `ini` `json` `markdown` `nginx` `powershell` `typescript` `yaml`；`markup`（html/xml/svg）、`css`、`clike` 由 Prism 核心自带。别名如 `c++`、`c#`、`delphi`、`vb`、`asm`、`sh`、`yml`、`md`、`vue` 会自动归一化。

页内目录（`.vp-doc-outline`）的尺寸、层级与状态取值与 VitePress 的 `VPDocAsideOutline` / `VPDocOutlineItem` 一致：1px 发丝线、1rem 内缩、链接 14px / 行高 2.2857143、当前项取 `--vp-c-text-1`，另带图样相同的 2px `.outline-marker`。当前项由宿主做滚动同步：给链接加 `.active`（或 `aria-current="location"`），并把 `.outline-marker` 的 `top`、`opacity` 设到对应位置；demo 实现见 `demo/main.js`。正文里的 `[[toc]]`（`.table-of-contents`）默认样式是无项目符号的卡片式目录，嵌套层级自动缩进，这是相对 VitePress 的故意增强（VitePress 本体不给它样式）。

`<Badge>` 这类主题组件不在包内，但样式随包发布：`index.css` 已包含 `.VPBadge` 规则与 `--vp-badge-*` 变量，宿主只需提供组件脚本。mdoc 已有自己的主题样式，只引脚本、不引这套 CSS；纯 ESM 场景同时引 CSS 与组件即可。

KaTeX 的样式与字体属于 peer，由你安装的 `katex` 包提供，需自行引入：

```js
import 'katex/dist/katex.min.css';
```

## 图标（Iconify）

图标组件由宿主提供，包里不再默认注册 `<Icon>`。两行接入：

```js
import { Icon } from '@iconify/vue';

app.component('Icon', Icon); // 之后 markdown 里的 <Icon> 即可渲染
```

```md
<Icon icon="logos:vite" width="24" height="24" />
<Icon icon="lucide:rocket" />
```

这样做的原因：mdi2esm 不持有图标实例，就不会把「`@iconify/vue` 必须单实例」变成宿主的默认约束；宿主用哪个版本、哪个图标集完全自己决定。

如果希望由包内代劳（纯 ESM 场景图省事），显式开启：

```js
createConfig({ icons: true }); // 用包内的异步 Icon（动态 import('@iconify/vue')）
createConfig({ icons: MyIcon }); // 或者直接指定组件
```

包内不内置图标集，未注册的图标由 Iconify 默认 API `api.iconify.design` 联网获取，离线、内网或无此图标时会留空。需要离线渲染时安装 `@iconify-json/*`，再调用本包的 `registerIconCollection()`（或直接 `addCollection()`）：

```js
import { registerIconCollection, registerIcon } from 'mdi2esm';
import { icons } from '@iconify-json/lucide';

await registerIconCollection(icons); // 整个集合
await registerIcon('demo:spark', { body: '<path d="M12 2l9 9-9 9-9-9z"/>', width: 24, height: 24 });
```

`registerIconCollection` / `registerIcon` 内部按需 `import('@iconify/vue')`，同样解析到宿主自己那份实例，所以注册对宿主的 `<Icon>` 直接生效；后注册也有效，Iconify 会通知已渲染的图标重绘。

开启 `icons: true` 或使用注册助手时，需自行安装 `@iconify/vue`（可选 peer），并保证它作为外部依赖只保留一份，打包器场景要显式去重：

```js
// Vite
export default { resolve: { dedupe: ['@iconify/vue'] } };

// Rollup
nodeResolve({ dedupe: ['@iconify/vue'] });

// webpack
resolve: { alias: { '@iconify/vue': path.resolve('node_modules/@iconify/vue') } };
```

再用 `npm ls @iconify/vue` 或 `npm dedupe` 确认依赖树只有一份。判断是否出现双实例：注册后 `getIcon('lucide:rocket')` 有值，但页面上的 `<Icon icon="lucide:rocket">` 仍然请求网络或空白，基本就是两份模块实例。

## 公共 API

包入口导出以下能力（无需记忆内部模块路径）：

- 配置：`createConfig`、`createEsmAdapters`、`createMdocAdapters`、`DEFAULT_CONFIG`、`DEFAULT_ADAPTERS`、`CONTAINER_LABELS`、`COPY_LABELS`
- 渲染环境：`createRenderEnv`
- 渲染：`renderMarkdown`、`renderSource`、`renderMath`、`md`（markdown-it 实例）、`ensureCustomContainers`、`buildOutline`、`escapeInvalidInterpolations`、`resolvePath`
- 代码块：`applyCodeBlock`、`maskFenceMarkers`、`unmaskFenceMarkers`、`highlightCode`、`highlightBlock`、`normalizeLang`、`Prism`
- 管线：`createMarkdownComponent`、`extractTopLevelBlocks`
- 其它：`stripFrontmatter`、`mountImageZoom`、`mountMermaid`
- 浏览器脚本模块：`createScriptModule`、`createSetup`、`buildScriptModuleSource`、`buildSetupModuleSource`
- Markdown 插件辅助：`anchorHref`、`normalizeHash`、`applyRestoreEntities`、`applyTablePlugin`、`applyLineNumbers`、`fenceMetaAttrs`、`escapeHtml`

`renderMarkdown(source, { dir, config })` 返回 `{ html, headings }`；`renderMath(html, config)` 异步返回注入 KaTeX 后的 HTML；`buildOutline(headings)` 生成树形大纲。

## 独立代码块

不在 markdown 内、由宿主组件自行渲染代码时，直接用 `highlightBlock`，与正文代码块共用同一套 Prism 语法与行切分：

```js
import { highlightBlock } from 'mdi2esm';

const { html, lang, ok } = highlightBlock(code, 'ts', { meta: '{2,4-5}' });
// html: <pre class="language-ts"><code><span class="line">…</span></code></pre>
// ok: false 表示语言未注册，内容已转义为纯文本
```

配套约定：

1. 宿主容器加 `mdi-code` 类，token 配色才会生效（`index.css` 里的规则是 `:is(.vp-doc, .mdi-code) .token`，深色走 `.dark`）。
2. 行号、折行、最大高度等布局由宿主控制；`html` 里每行已包好 `.line`，行号用 `counter` 实现即可。
3. 需要注册额外语言或直接用 `Prism.highlight` 时，用导出的 `Prism`：`Prism.languages.demo = {…}`。

## 开发

```sh
npm install          # 安装依赖
npm run build        # 构建 dist/index.js 与 dist/index.min.js
npm test             # 运行 node:test 测试
npm run lint         # eslint 检查（--max-warnings 0）
npm run lint:fix     # eslint 自动修复
```

构建使用 Vite 8（rolldown 打包）。宿主项目通过 npm 安装本包后，用 npm2esm 等工具预构建为浏览器 ESM 产物并配合 import map 使用。

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
