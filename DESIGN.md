# mdi2esm 设计文档

本文档与代码同步，说明 mdi2esm 要解决的问题、设计取舍与当前实现。面向需要改源码或评估接入门槛的读者；接入用法见 [README.md](./README.md)。

> 版本 1.0.0。文档与代码同步维护；若不一致，以代码为准并修订本文。

## 1. 要解决的问题

宿主是一个浏览器里的文档站（典型是 mdoc 这类 SPA：vue-router + 原生 ESM + importmap），需要在运行时把一份 Markdown 文本变成可交互页面。难点不在 Markdown 语法本身，而在下面这些宿主相关约束：

1. **路径与部署形态多变**：同一份 md 可能部署在站点根或子路径（`base`），也可能被宿主嵌套进自己的路由层。md 里的相对链接必须按 md 文件的逻辑目录解析，再叠加站点的路径规则（`.md` 剥除、`index` 归一化、`/public` 资源改写等）——这些规则因宿主而异。
2. **运行时没有打包器**：`<script setup>` 里作者会写 `import` 和响应式绑定；产物虽在构建期被打包成浏览器原生 ESM，但**宿主运行时**没有 Vite/Webpack 帮它解析 `<script>` 里的模块。
3. **重依赖不应默认进产物**：Prism 主题、KaTeX、Mermaid、ECharts、图片缩放库都体积可观，宿主可能已有自己的主题或根本不用某项能力。
4. **宿主已有自己的渲染体系**：库不能假设目录结构、路由形态、主题变量，也不能往页面里塞 `<link>`/`<script>`。
5. **产物要可嵌入**：dist 需要能被任意静态托管/嵌套部署，最好自包含、可预测。

## 2. 设计

### 2.1 分层：渲染层与宿主壳

核心取舍是**把"渲染"和"宿主规则"彻底分开**：

- **渲染层**（本包）：Markdown → HTML/template → Vue 组件。只认通用语义（外链、锚点归一化、相对路径解析、图片尺寸、代码高亮、公式占位、图表占位、容器）。
- **宿主壳**（mdoc 等）：路径前缀与路由规则、文案、主题、注入的组件（`Icon`）、可选依赖的供给。

宿主壳是**主注入点**：站点级差异经 `createConfig(...)` 传入；页面级数据（`frontmatter` / `params`）和注入的 `Icon` 组件经 `createMarkdownComponent` 的最后一个参数传入；可选依赖（KaTeX / Mermaid / ECharts / medium-zoom 等）由宿主安装供给。渲染层只读 `config` / `env` 与这些注入，不猜宿主环境、不按目录推断语言、不写死任何路径。

### 2.2 单例 markdown-it + 装配

`src/markdown-it.js` 持有一个模块级 `MarkdownIt` 实例，依赖在构建期被打进产物。装配整体移植自 mdoc，插件次序对齐 VitePress 官方 `markdown.ts`：

- 先挂纯规则（`applyRestoreEntities` 实体还原、`applyTablePlugin` 表格 `tabindex`、`applyTableChart` 表格转图表），再按次序 `md.use(...)` 第三方插件（attrs / tasklist / footnote / mark / sub / sup / cjkFriendly / anchor / toc）。
- **目录**：`[[toc]]` 占位符由 `@mdit-vue/plugin-toc` 生成 token，其渲染规则被自研实现覆盖（`toc_body`）：按 `config.markdown.toc.level` 过滤、`showAutoNumber` 编号、`allowMultiToc` 多目录控制；编号由 anchor 的 permalink 回调按 h2–h6 分级计数写入 `env.tocNumbersBySlug` 与 heading token 的 `meta.number`，只作展示，不进 slug / `headings`。
- `@mdit/plugin-container` 被复用注册 v-pre / raw / code-group / details 等容器；github-alerts 是**自研 core 规则**（`md.core.ruler.after('block', ...)`），不是插件。
- 行内图标短码（`:i-集合-图标:`）、数学公式（`math_inline` / `math_block`）、音视频嵌入（`!video[标题](url)` / `!audio[标题](url)`，对齐 cherry 语法）用 `ruler.after/before` 插入。
- **时间线**：`:::timeline [标题]` 容器，内部独占一行的 `::` 分隔节点，节点首行 `[状态] [日期] 标题`，其后为描述。自研 block 规则 `timeline`（`block.ruler.before('fence')`，注册在 `plugin-container` 之前，避免被通用容器先尝试）；状态别名归一到 `done` / `doing` / `todo` / `milestone` / `error`；描述用**副本 env** 递归 `md.render`，避免节点内标题污染主文档 `headings` 与编号计数；未闭合容器不消费（交回普通 markdown）。
- **配置装配的幂等性因项而异**：`mark/sub/sup` 关闭（`syntaxConfigured`）只执行一次，**首渲染后锁定**；emoji 挂载经 `emojiReady ??=` 缓存，只挂一次，但它是异步的——`renderMarkdown` 不等待，首次渲染可能尚未启用 emoji（`createMarkdownComponent` 会在渲染前 `await`）；自定义容器则每次渲染都检查、新容器**累积注册**（`registeredCustomContainers` 仅去重）。因为 `md` 是单例，同一进程内不支持多套配置共存（见 §3.6）。

### 2.3 渲染管线

```
Markdown 原文
  → parseFrontmatter + extractTopLevelBlocks（frontmatter 剥离 + 顶层 <script>/<style> 提取，围栏内不动）
  → maskFenceMarkers          （保护代码块，避免被后续处理破坏）
  → md.render(source, env)    （markdown-it，env 承载 dir/adapters/labels/headings）
  → unmaskFenceMarkers
  → renderMath                （KaTeX 按需增强，见 §2.6）
  → escapeInvalidInterpolations
  → compile(html)             （Vue 运行时编译）
  → defineComponent(...)      （markRaw 包裹）
```

`createMarkdownComponent` 用 `parseFrontmatter`（可经 `frontmatterParser` 替换）+ `extractTopLevelBlocks` 取得 body 与脚本/样式；`renderMarkdown` 只接收 body，frontmatter 由调用方自行处理。`env` 由 `createRenderEnv(config, page)` 展开：规则回调一律从 `env` 取 `dir` / `adapters` / `containerLabels` / `copyLabels`，避免模块级可变单例。`headings` 在渲染期由 anchor 插件的 permalink 回调按出现顺序收集（h2–h6），渲染完再 `buildOutline` 组装成目录树。

### 2.4 路径处理：adapters

渲染层只做两件通用的事：

- **相对解析** `resolvePath(base, rel)`：把 `./`、`../` 折叠成规范化路径；
- **形态归一化**：外链加 `target/rel/图标`、`#anchor` 归一化、图片 `=WxH` 尺寸、`loading=lazy`。

URL 的**拼装规则**交给 `config.adapters` 的四个函数（`src/config.js`）：

| 函数             | 输入                       | 职责                              |
| ---------------- | -------------------------- | --------------------------------- |
| `toHref`         | `{ path, resolved, hash }` | 链接 → 最终 URL（含路由形态）     |
| `toSrc`          | `{ src, resolved }`        | 图片/资源 → 最终 URL              |
| `toScriptImport` | `{ spec, resolved }`       | `<script>` 相对说明符 → 绝对 URL  |
| `scriptContext`  | `{ frontmatter, params }`  | `<script setup>` 额外注入的上下文 |

`createBaseAdapters(base)` 把 `base` 归一化成 `root`/`prefix`，提供默认实现（子路径/嵌套部署走同一条路）；`createConfig` 用浅合并让宿主**只覆写单个函数**（如 mdoc 覆写 `toHref/toSrc` 做 index 归一化与 `/public` 改写）。

关键约束：**`base` 不作为字段出现在 config 上**，而是"编译"进 adapters——避免 `<base>`、config、适配器之间出现多个真相来源。默认实现只表达通用形态（`.md` 剥除），路由语义由宿主覆写决定。

adapters 只接收路径/上下文字段（见上表），不接收每次渲染的 `env`；若宿主规则依赖 frontmatter 或路由状态，在覆写函数内用闭包捕获（或从 `scriptContext` 取 frontmatter/params）。

### 2.5 脚本：`<script setup>` 与 `<script>`

浏览器没有打包器，所以脚本模块必须自己拼成可执行的 ESM（`src/markdown-script.js`）：

- **只支持一个顶层 `<script>`**：`<script setup>` 与普通 `<script>` 互斥（看第一个是哪种），不能并存；第二个及以后的 `<script>` 视为正文内容（`html: true` 下作为原始 HTML 输出，浏览器不执行 `<script>` 标签）。
- **`<script setup>`**：`hoistImports` 把 `import` 提到模块顶层，相对说明符经 `toScriptImport` 变成**绝对 URL**（Blob URL 无相对基准，这是硬约束）；随后拼出 `export function setup() { ... return { bindings } }`，用 `URL.createObjectURL(new Blob([source]))` 动态 `import()`，取出 `setup` 作为组件的 `setup`。
- **普通 `<script>`**：默认导出（选项对象）并入组件选项，`mounted` 与管线 mounted 链式合并；`render/template` 视为 markdown 正文忽略。
- **数据注入**：`frontmatter` 挂到实例（`beforeCreate` 设 `$frontmatter`），并经 `scriptContext` 注入 setup 作用域；`params` 仅经 `scriptContext` 注入 setup 闭包常量，不作为组件 props 暴露（见 §3.6）。
- **失败降级**：脚本执行/解析失败时 `console.warn` 并降级为无脚本渲染，不影响正文。

### 2.6 可选依赖与惰性加载

- **内联进产物**：Prism 核心 + 常用语言（构建期打包），`highlightCode` 同步高亮，宿主无需安装。
- **运行时按需**：KaTeX、Mermaid/Pele、ECharts、medium-zoom 都走 `src/lazy-module.js` 的 `lazyModule(importFn, onFail)`——promise 缓存 + 失败回 `null`，由调用方降级（公式按原始文本、图片不放大、图表留源码占位）。
- **图表实例管理**：`src/echarts.js` 的 `useECharts(el, height, getOption, { sourceText })` 统一 `EChartsBlock` 与 `EChartsTableBlock` 的 init / setOption / 暗色重建 / resize / dispose / 降级；`loadOption` 用 Blob URL 求值 JS 字面量 option。
- **不内置**：markdown-it-emoji（可选 peer，装了才启用，`ensureEmojiPlugin` 幂等）、Iconify 图标（由宿主注入 `Icon` 组件）。
- **样式**：只有 `src/styles/index.css`（`@import` vars/icons/doc）必带，构建为 `dist/index.css`；**无独立 `prism.css`**——Prism token 配色在 `doc.css`，换主题覆盖 `--vp-*` / `.dark` / `.token` 规则；KaTeX 的 CSS 由宿主自己 import，库不注入 `<link>`。

### 2.7 组件边界

每份 md 编译成一个匿名组件（不设 `name`，避免 devtools 混淆）：

- 内置 `ClientOnly`（`<slot/>` 占位）、`MermaidBlock`、`EChartsBlock` 与 `EChartsTableBlock`（图形由组件在自身挂载后写自己的根节点，不查 `document`，多份 md 互不干扰）；
- `Icon` 由宿主注入，包内不持有组件、不内置图标集；
- `markRaw` 包裹组件，避免 Vue 对编译产物做响应式代理；
- 图片缩放在**组件根节点内**查找（`mountImageZoom(this.$el)`），多份 md 同页互不干扰，不依赖全局 `.vp-doc` 选择器。
- Mermaid 的 `pele` 驱动配色由组件内联 `--pele-*`（从 `--vp-*` 派生），不依赖包内 CSS 是否被引入；`mermaid` 驱动在挂载时按 `html.dark` 选主题，并在 `.dark` 切换时重绘。

### 2.8 安全与 CSP

- **Markdown 源按可信内容对待**：不做 HTML 净化。`<script>` / `<script setup>` 会执行作者代码（等同 XSS 面），只应在可信源（自有文档）下启用；不可信源设 `config.markdown.scripts = false`（不提取也不执行），或在宿主侧前置剥离。
- **Vue 运行时编译**：`createMarkdownComponent` 用 `compile()` 把 md 编成模板，需要 `unsafe-eval`；严格 CSP（无 `unsafe-eval`）下编译失败。要嵌入严格 CSP 页面需宿主预编译或自行处理。
- **Blob URL 动态 import**：`<script>` 模块与 `echarts` 围栏的 option 均经 `blob:` URL 执行（后者包成 `export default (<字面量>);`），需 `script-src blob:`（或等价允许）；受限时脚本降级为无脚本渲染、echarts 降级为源码（均 `console.warn`）。
- **插值检测**：`escapeInvalidInterpolations` 用 `new Function` 判断表达式合法性，`unsafe-eval` 受限时把合法插值也转义为字面量（不影响安全，影响交互）。
- **裸 HTML**：markdown-it `html: true`，Markdown 里的裸 HTML 会渲染，库不做净化；宿主若担心注入，应在源侧保证可信或自行过滤。

## 3. 当前实现

### 3.1 文件结构

| 文件                          | 职责                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.js`                | 包入口，只导出公共 API                                                                                                                                                                           |
| `src/config.js`               | `createConfig` / `createRenderEnv` / `createBaseAdapters` / 默认文案                                                                                                                             |
| `src/markdown-it.js`          | markdown-it 实例与插件装配、锚点/目录、容器、github-alerts、数学占位、图标短码、音视频嵌入、时间线                                                                                               |
| `src/render.js`               | `renderMarkdown` / `buildOutline` / `link_rewrite`（链接、图片与音视频 src 重写 core 规则）                                                                                                      |
| `src/pipeline.js`             | `createMarkdownComponent`：frontmatter → 块提取 → 渲染 → 组件装配                                                                                                                                |
| `src/markdown-script.js`      | `<script>` / `<script setup>` 的模块拼接与 Blob 加载                                                                                                                                             |
| `src/markdown-plugins.js`     | 官方纯规则：实体还原、表格、语言提取、hash 归一化                                                                                                                                                |
| `src/code-block.js`           | 代码块 `preWrapper`/`v-pre`/围栏 marker 保护                                                                                                                                                     |
| `src/code-lines.js`           | 行号与高亮行的 HTML 切分                                                                                                                                                                         |
| `src/prism.js`                | Prism 封装（语言别名归一、同步高亮）                                                                                                                                                             |
| `src/code-block-component.js` | 独立 `highlightBlock` 组件（预览/复制）                                                                                                                                                          |
| `src/math.js`                 | KaTeX 占位标记的运行时替换                                                                                                                                                                       |
| `src/mermaid.js`              | `MermaidBlock` 组件与双驱动（pele/mermaid）                                                                                                                                                      |
| `src/echarts.js`              | `useECharts`（图表实例生命周期）/ `loadOption`（Blob URL 求值 JS 字面量 option）/ `EChartsBlock` 组件（可选 peer）                                                                               |
| `src/echarts-table.js`        | `EChartsTableBlock` 组件：表格数据 + option → 图表（复用 `useECharts`）                                                                                                                          |
| `src/table-chart.js`          | 表格首格 `:type: {options}` → `<EChartsTableBlock>` 的渲染规则与 option 构造                                                                                                                     |
| `src/image-zoom.js`           | medium-zoom 图片放大                                                                                                                                                                             |
| `src/frontmatter.js`          | frontmatter 剥离与内置子集解析（可替换）                                                                                                                                                         |
| `src/lazy-module.js`          | 可选依赖的惰性加载封装                                                                                                                                                                           |
| `src/styles/`                 | `index.css`（样式入口：`@import` vars/icons/doc，构建合并为 `dist/index.css`）、`doc.css`（正文/容器/代码 + Prism token 配色）、`icons.css`（copy / external-link 图标）、`vars.css`（主题变量） |

仓库根另有 demo 页面 `index.html`（左编辑右预览，示例图片在 `public/`）与 `scripts/build.mjs`；`vite.config.mjs` 提供 `vue` / `mdi2esm` 别名，dev、build、preview 共用。

### 3.2 公共 API

包入口共八个导出（`src/index.js`；完整用法与示例见 README）：

- `createConfig({ base, adapters, locale, labels, markdown, mermaidDriver, echarts, ... })`
- `renderMarkdown(body, { dir, config })` → `{ html, headings }`（**不等待 emoji 挂载**：首次渲染可能少 emoji，实时预览场景需先 `await ensureMarkdownReady()`；`createMarkdownComponent` 已内置该等待）
- `createMarkdownComponent(source, dir, config, { frontmatter, params })` → `{ component, headings }`（渲染前会 `await ensureMarkdownReady()`）
- `buildOutline(headings)` → 目录树
- `highlightBlock(props)` → 独立代码块组件
- `ensureMarkdownReady()` → `Promise<void>`（挂载可选的 markdown-it-emoji，幂等）
- `assertConfigCompatible(config)` → 单例配置冲突告警（首次记录指纹，后续不同则 `console.warn`）
- `md` → markdown-it 实例（供特殊扩展，一般不用）

内部步骤（`resolvePath`、`maskFenceMarkers`、`renderMath`、`escapeInvalidInterpolations`、`extractTopLevelBlocks` 等）不视为稳定 API。公共 API 带 JSDoc，未发布 `.d.ts`。

### 3.3 关键流程（代码位置）

- **配置注入**：`createConfig`（`config.js`）把 `base` 编进 `adapters`，展开默认值与宿主覆盖；`createRenderEnv` 生成每次渲染的 `env`。
- **渲染**：`renderMarkdown`（`render.js`）负责围栏保护、`md.render`、公式增强；插值转义在 `createMarkdownComponent` 编译前完成。链接/图片重写在 `link_rewrite`（`render.js` 的 `core.ruler.push`）里完成。
- **组件**：`createMarkdownComponent`（`pipeline.js`）串起 frontmatter、块提取、emoji 就绪、渲染、脚本模块、样式注入、组件定义。
- **脚本**：`hoistImports` / `buildSetupModuleSource` / `importModuleSource`（`markdown-script.js`）。
- **rebase**：`<!-- @include-start: dir -->` 标记由宿主（如 mdoc 的 source-expander）生成，渲染层在 `link_rewrite` 里消费并切换 `dir` 栈，使被包含文件的相对链接按其目录解析。
- **表格转图表**：`applyTableChart`（`table-chart.js`）包装 `table_open`：首格声明 → 前置 `<EChartsTableBlock>`（属性 `encodeURIComponent`），表头 / 数据行从 token 提取；`buildTableChartOption` 把表格映射为 series（通用 / pie·funnel / radar）。
- **目录**：anchor 的 permalink 回调收集 `headings` 并写编号（`env.tocNumbersBySlug` / `meta.number`）；`toc_multi`（`core.ruler.after('anchor')`）按 `allowMultiToc` 标记多余占位符；`toc_body` 渲染规则按 `level` 过滤并输出 `nav.table-of-contents` 列表。

### 3.4 样式产物

- `dist/index.css` = `vars.css` + `icons.css` + `doc.css`（含 Prism token 配色，必带）；
- 没有独立 `prism.css`：配色是 `doc.css` 的一部分，换主题改 `--vp-*` / `.dark` 变量或直接覆盖 `.token` 规则。
- 宿主主题变量与 `vp-doc` / `mdi-code` 选择器约定见 `doc.css`（接入细节见 README 样式章节）。

### 3.5 构建与分发

- `npm run build`：产出 `dist/index.js`、`dist/index.min.js`、两份 CSS，外加 Vite 构建的根 demo（自包含）。
- `package.json` 的 `exports`：`.`（`development` → `dist/index.js`，默认 → `dist/index.min.js`）、`./index`、`./index.min`、`./index.css`、`./index.min.css`、`./package.json`。
- **dependencies**：markdown-it 栈（`markdown-it` / `@mdit/*` / `@mdit-vue/*` / `markdown-it-cjk-friendly`）与 `prismjs`（构建期内联进产物）；**peerDependencies**：`vue`、`vue-style-runtime`（宿主提供，产物静态导入）；可选 peer：markdown-it-emoji、katex、mermaid、pele、echarts、medium-zoom、@iconify/vue（依赖清单与脚本见 README）。
- **浏览器基线**：原生 ESM、动态 `import()`、Blob URL / `URL.createObjectURL`、importmap（可选）、CSS 自定义属性；宿主 Vue 必须是**含模板编译器**的构建（`compile` 需要）。
- **体积**（v1.0.0，含表格转图表 / 目录增强 / 时间线 / 音视频；内联 Prism 核心 + 常用语言与 markdown-it 栈）：`dist/index.js` ≈ 464 KB、`dist/index.min.js` ≈ 319 KB、`dist/index.css` ≈ 38 KB、`dist/index.min.css` ≈ 33 KB（实测字节 475636 / 326660 / 39169 / 34201）；重依赖（KaTeX / Mermaid / Pele / ECharts / medium-zoom）不内联，按需动态加载。

### 3.6 已知边界（实现现状）

- **单例限制（实现现状，非 SPA 必然）**：`md` 是模块级单例，**一个进程只服务一套配置**。宿主典型场景（SPA 单页内单实例）不受影响；真正把配置锁死成“首份生效”的只有三处改了 `md` 实例本身的操作——`mark/sub/sup` 的 `ruler.disable`（首渲染后锁定）、自定义容器累积注册（同名以先注册者为准）、emoji 的 `md.use`（只挂一次且异步）；其余配置（`dir` / `adapters` / `level` / `lineNumbers` 等）都经每次渲染的 `env` 隔离，本身可多配置共存。`assertConfigCompatible(config)` 首次记录行为指纹（locale / markdown 开关 / mermaidDriver / 容器等，不含 adapters 函数引用），后续切到不同配置时 `console.warn` 且仅首份生效。因此 SPA 多实例、测试隔离、热更新、多站点复用受此限制——这是**可偿还的实现债**（中期方向 `createMarkdownRenderer(config)` 工厂，每实例独立 md），不是架构必然。
- **无 SSR**：渲染在浏览器完成，产物是客户端组件。
- **只支持一个顶层 `<script>`**：`<script setup>` 与普通 `<script>` 互斥，不能并存；第二个及以后的 `<script>` 留在正文（`html: true` 下作为原始 HTML 输出，不执行）。
- **默认路由语义有限**：`createBaseAdapters` 只剥 `.md`、不归一化 `index`；路由规则由宿主覆写（见 README 的 mdoc 示例）。
- **`<base>` 不参与**：路径前缀由 `adapters` 显式计算，不依赖文档 `<base>`（`<base>` 无法覆盖相对解析与 script 绝对化，见 README 部署路径章节）。
- **脚本 import 用正则解析**（`IMPORT_RE`，仅行首单行）：
  - 支持：`import default / { named } / * as ns from 'spec'`、side-effect `import 'spec'`；
  - 不支持：多行 import、`import type`（会被当普通子句原样保留，浏览器下报语法错）、动态 `import()`、`import.meta`（Blob 模块中 `import.meta.url` 指向 Blob URL）；
  - 注释/字符串里同形文本可能被误提取；复杂脚本应由宿主预处理器处理。
- **仅 import 的普通 `<script>` 会保留**：`buildScriptModuleSource` 在只有 import、没有其它语句时也产出模块，避免副作用 import 丢失。
- **插值检测受 CSP 影响**：`escapeInvalidInterpolations` 用 `new Function` 判断表达式合法性，`unsafe-eval` 受限时会把合法插值也转义成字面量。
- **重写只覆盖 markdown 语法**：`html: true` 下裸 HTML 会渲染，但其中的 `<a>` / `<img>` 不参与 `link_rewrite`——子路径/嵌套部署时裸 HTML 里的相对链接不会加 `base` 前缀，需宿主改写或避免使用（见 README 部署路径章节）。
- **音视频 src 不做协议白名单**：`!video[]()` / `!audio[]()` 与图片同策略——相对路径按 `dir` 解析并经 `toSrc`，`http(s)` / `mailto:` / `#` / `data:` 原样保留；`javascript:` 等既非协议直过也非相对路径的写法会按相对路径拼接（不会作为脚本执行）。产物是原生 `<video>` / `<audio>`，无独立组件、无加载失败降级。
- **`params` 不是组件 props**：只注入 `<script setup>` 作用域（`const params = ...`），模板要直接用需经 setup 返回；`params` / `frontmatter` 在组件创建时注入，之后变化不会更新，宿主需重建组件。
- **heading id 无命名空间**：anchor 的 slug 由标题文本生成，多份 md 同页可能出现重复锚点；库不做前缀/命名空间（`md` 单例，slugify 全局固定）。
- **错误边界**：frontmatter 解析失败按无 frontmatter 处理；`md.render` 异常向上抛（宿主可捕获）；`<script>` 解析/执行失败降级为无脚本渲染（warn）；KaTeX / Mermaid / ECharts / medium-zoom 加载失败分别按原始文本 / 源码占位 / 源码占位 / 不放大降级（ECharts 另在 option 解析/执行失败或 `setOption` 抛错时显示源码 + 错误信息）。
- **时间线描述是独立子文档**：节点描述用副本 `env`（重置 `headings` / `tocCounters` / `tocNumbersBySlug`）递归渲染，节点内标题不进主文档目录、不影响编号；但节点内若再写 `:::timeline` 会递归解析，**无深度护栏**（对比 `vue-style-runtime` 的 `depth > 32` 上限）：恶意或意外的深层嵌套可致调用栈溢出，属已知健壮性缺口，当前按输入可信假设接受。未闭合的 `:::timeline` 不渲染为时间线，按普通段落输出。
- **表格转图表只认首格声明**：`CHART_REGEX` 要求整格就是 `:类型:` 或 `:类型: {…}`；options 是 JS 字面量（同 `echarts` 围栏），JSON 也兼容；`series` 与坐标轴由表格生成，用户 options 里的 `series` 会被覆盖；未知类型交给 `setOption`（不报错但可能无图形）。
- **目录编号是展示层**：`showAutoNumber` 只在标题渲染与 `[[toc]]` 输出时加 `span.toc-number`，不改 `headings` / slug / 锚点；`buildOutline` 输出不含编号。

## 4. 与宿主（mdoc）的集成要点

宿主负责：`fetch` md 源文本、展开 `@include`、提供 `dir`（逻辑目录）与 `base`、覆写 `adapters`（路由规则）、提供 `Icon` 组件与可选依赖、把 `component` 挂进路由视图。库只负责把文本变成组件，并在需要时经 `adapters` 使用宿主规则。
