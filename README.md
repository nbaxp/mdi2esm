---
title: mdi2esm
description: markdown-it 封装与 Vue 组件管线，一个文件演示全部 Markdown 能力
---

# mdi2esm

A markdown-it wrapper with common plugins integrated. It renders Markdown into VitePress-style HTML, with code highlighting, math (KaTeX), Mermaid diagrams, ECharts charts, outlines and image zoom built in. The core markdown stack and Prism are bundled into a single browser-ready ESM artifact; framework and heavy dependencies are left as peers for the host to provide.

> 这份 README 是包文档；可编辑的能力演示在同目录 `demo.md`，demo 运行时渲染的就是它。基础语法、容器、GitHub alerts、脚注、任务列表、图标与 emoji 短码、CJK 混排、属性、目录、代码高亮、数学、图表（含表格转图表）、图片缩放，以及宿主注入的组件（`<Badge>` / `<Icon>`）和 `<script setup>` 都在 `demo.md` 里。

## 环境要求

- Node.js >= 20（见 `package.json` 的 `engines`）。
- 浏览器侧运行，运行时需要宿主的 import map 或打包器解析 peer 依赖。

## 安装

```sh
npm i mdi2esm
```

同时安装 peer 依赖（用到哪些功能装哪些；完整能力需要全部）：

```sh
npm i mdi2esm vue vue-style-runtime katex mermaid pele echarts
```

`echarts` 是可选的：不装时 `echarts` 围栏降级为源码块，其余功能不受影响。

## 用法

只出 HTML 字符串（不挂 Vue，纯 `innerHTML` 场景）：

```js
import { renderMarkdown, buildOutline, createConfig } from 'mdi2esm';

const config = createConfig();
const { html, headings } = await renderMarkdown('# 标题\n正文', { config });
const outline = buildOutline(headings);
```

挂成 Vue 组件——编译结果就是一个普通组件，是否响应式、什么时候重编译都由宿主决定：

```js
import { Icon } from '@iconify/vue';
import { createApp, h } from 'vue';
import { buildOutline, createConfig, createMarkdownComponent } from 'mdi2esm';

import 'mdi2esm/index.min.css';
import 'katex/dist/katex.min.css';

import { VPBadge } from './vp-badge.js'; // 宿主自己写的 <Badge>

const config = createConfig({
  mermaidDriver: 'pele', // 默认值；切原生渲染改成 'mermaid'
  markdown: { container: [{ type: 'demo', title: '自定义容器' }] },
});

// 1. 取源文本：库只吃字符串，跟构建工具无关——fetch、接口返回、textarea 内容都行
const source = await fetch('./demo.md').then((res) => res.text());

// 2. markdown → 组件：frontmatter、Prism 高亮、KaTeX、<script setup> 都在内部处理
const { component, headings } = await createMarkdownComponent(source, '', config);

// 3. md 里用到的组件只注入到这一个实例，不污染全局
component.components = { ...component.components, Icon, Badge: VPBadge };

// 4. headings 是 [{ level, title, slug }]，buildOutline 整理成 { title, link, children } 的树
const outline = buildOutline(headings);

createApp({ render: () => h(component) }).mount(document.getElementById('content'));
```

`createMarkdownComponent(source, dir, config, { frontmatter, params })` 的入参都是纯数据：`dir` 是相对链接、相对 `import` 的基准目录；返回 `{ component, headings }`。文本变化后的重编译与并发时序也由调用方决定——demo 在 `index.html` 里就是 `await createMarkdownComponent(...)` 后替换视图组件，并用递增序号丢弃过期结果。

只要 HTML 字符串、不需要 Vue 组件时，用上面第一节的 `renderMarkdown`——两者的区别只在于要不要把结果挂成组件。

`index.html` 里取源文本就是一句 `fetch('./demo.md')`——库只吃字符串，文本从哪来跟它无关，`fetch`、接口返回、`textarea` 内容都一样。

`package.json` 的 `exports`：`.`（默认/生产 → `dist/index.min.js`，`development` → `dist/index.js`），显式 JS 入口 `mdi2esm/index`、`mdi2esm/index.min`，样式入口 `mdi2esm/index.css`、`mdi2esm/index.min.css`。

### 不打包：浏览器原生 ESM + importmap

`dist/index.min.js` 本身就是浏览器可加载的 ESM，静态导入只有 `vue` 和 `vue-style-runtime` 两个（`katex` / `pele` / `mermaid` / `echarts` 是动态 `import()`，用到才加载）。所以连 Vite 都不需要，importmap 映射 peer 即可（`echarts` 可省略，省略时降级为源码块）：

```html
<script type="importmap">
  {
    "imports": {
      "vue": "/node_modules/vue/dist/vue.esm-browser.prod.js",
      "vue-style-runtime": "/node_modules/vue-style-runtime/dist/index.min.js",
      "pele": "/node_modules/pele/dist/pele.js",
      "echarts": "/node_modules/echarts/dist/echarts.esm.min.js"
    }
  }
</script>

<script type="module">
  import { createApp, h } from 'vue';
  import { createConfig, createMarkdownComponent } from '/node_modules/mdi2esm/dist/index.min.js';

  // 宿主组件就是一个带 template 字符串的对象，没有 SFC，也没有编译步骤
  const Badge = {
    props: ['text', 'type'],
    template: '<span class="badge" :data-type="type"><slot>{{ text }}</slot></span>',
  };

  const source = await fetch('./demo.md').then((res) => res.text());
  const config = createConfig();

  // 运行时编译，和打包场景一样
  const { component } = await createMarkdownComponent(source, '', config);
  component.components = { ...component.components, Badge };
  createApp({ render: () => h(component) }).mount('#app');
</script>
```

**Vue 必须是含模板编译器的构建**，这条最容易踩。`createMarkdownComponent` 内部用 `compile()` 把 Markdown 编成模板，而 runtime-only 版的 `compile` 是个直接抛错的占位：

| 场景          | 要用的文件                                              |
| ------------- | ------------------------------------------------------- |
| importmap     | `vue/dist/vue.esm-browser.prod.js`（或 `.js`）          |
| Vite / Rollup | `resolve.alias: { vue: 'vue/dist/vue.esm-bundler.js' }` |
| webpack       | `resolve.alias: { vue: 'vue/dist/vue.esm-bundler.js' }` |

裸 `import ... from 'vue'` 在打包器里默认解析到 `vue.runtime.esm-bundler.js`，少了上面这条 alias，`createMarkdownComponent` 会在 `compile is not a function` 上挂掉。上面「挂成 Vue 组件」的示例同样要配。

本仓库的 demo 在 `index.html`（整页自包含：骨架、内联样式、内联脚本——宿主组件 `VPBadge` 与左编辑右预览逻辑都在里面），由 Vite 接管两种运行方式：

- `npm run dev`：Vite 服务根目录 `index.html`，内联脚本里的裸导入由 Vite 重写到**源码**（`mdi2esm` 经 `vite.config.mjs` 的 alias 指到 `src/index.js`）——改 src 立即生效。
- `npm run build && npm run preview`：build 把 `index.html` 当入口打进 `dist/`，所有导入解析成打包产物，**dist 自包含**——整个目录发布到 GitHub Pages（或任意静态托管）就能直接演示，无 importmap、无 node_modules 依赖；`vite preview` 服务 dist。

推 `v*` Tag 时 GitHub Actions（`.github/workflows/publish.yml` 的 `pages` job）会构建并把 dist 部署到 `gh-pages` 分支（仓库 Pages 源需指向 gh-pages / root）。

## 部署路径（base）

md 里的相对链接、图片、`<script setup>` 里的相对 import，最终 URL 都由 `createConfig({ base })` 决定。默认 `'/'`，即站点部署在域名根；放到子路径时传实际前缀：

```js
createConfig(); // ./guide/a.md → /guide/a
createConfig({ base: '/docs/' }); // ./guide/a.md → /docs/guide/a
```

`base` 不会出现在配置对象上——`createConfig` 内部把它编成 `adapters`（`toHref` / `toSrc` / `toScriptImport` / `scriptContext`），渲染层只读 `config.adapters`，不会出现两个真相来源。需要非标准规则（比如把 `index.md` 归一成目录、把图片改写到 `/public`）时，覆写对应那一个函数即可，其余仍按 `base` 生成：

```js
createConfig({
  base: '/doc/',
  adapters: {
    // guide/index.md → /doc/guide/（默认实现不把 index 归一成目录）
    toHref: ({ path, resolved, hash }) => {
      if (!/\.md$/i.test(path)) return `/doc/${resolved}${hash}`;
      const route = resolved.replace(/\.md$/i, '').replace(/index$/i, '');
      return `/doc/${route}${hash}`;
    },
  },
});
```

KaTeX 的样式不属于路径配置，库也不注入 `<link>`：`katex/dist/katex.min.css` 由宿主自己引入（见上一节）。

**裸 HTML 不参与路径改写**：Markdown 里的裸 HTML（`html: true` 会渲染）中的 `<a>` / `<img>` 不经过 `link_rewrite`，子路径/嵌套部署时其中的相对链接不会加 `base` 前缀。请在 Markdown 中用链接/图片语法，或自行改写裸 HTML。

## 样式

渲染产物的类名沿用 VitePress 风格（`.vp-doc`、`.custom-block` 等）。包内附带一套只覆盖渲染产物（`.vp-doc` 及 `.custom-block`、`.VPBadge` 等类名）的样式：

```js
import 'mdi2esm/index.min.css';
```

也可用未压缩的 `mdi2esm/index.css`。这套样式不包含站点 header、sidebar、nav、搜索等布局，宿主可以在 `:root` / `.dark` 上覆盖 `--vp-*` 变量做主题定制。代码高亮由 Prism 生成 `token` 类，配色已包含在样式里；Prism 本身已内联，无需额外安装。

`<Badge>` 这类主题组件不在包内，但样式随包发布：`index.css` 已包含 `.VPBadge` 规则与 `--vp-badge-*` 变量，宿主只需提供组件脚本。mdoc 已有自己的主题样式，只引脚本、不引这套 CSS；纯 ESM 场景同时引 CSS 与组件即可。

KaTeX 的样式与字体属于 peer，由你安装的 `katex` 包提供，需自行引入：

```js
import 'katex/dist/katex.min.css';
```

## 目录

正文里的 `[[toc]]` 生成 `.table-of-contents`（卡片式、按层级缩进），实例见 `demo.md`。右侧“大纲”栏由 `buildOutline(headings)` 从 h2–h6 生成，两者互相独立，见下面的「大纲」。

目录行为由 `createConfig({ markdown: { toc } })` 配置：

- `level`：目录包含的标题层级，默认 `[2, 3]`；
- `showAutoNumber`：标题与目录自动编号（`1` / `1.1` / …），默认 `false`；编号只作展示，不进锚点与 `headings`；
- `allowMultiToc`：是否允许多个 `[[toc]]`，默认 `true`；设为 `false` 时只渲染第一个，其余忽略并 `console.warn`。

demo 顶部提供这三个配置的开关（编号 / 多目录 / 层级），改动经 URL 参数写入并重新加载生效——`md` 是模块级单例，配置在首次渲染时锁定，运行中切换不生效。

## 组件接入（Vue）

库只内置 `ClientOnly`，md 里用到的自定义组件（`<Icon>`、`<Badge>` 等）都由宿主提供——否则模板里的标签解析不到，就是空白。

用 `createMarkdownComponent` 编译出组件后，把 md 里用到的组件挂到它的 `components` 上，只对这一个实例生效，不污染全局：

```js
const { component } = await createMarkdownComponent(source, '', config);
component.components = { ...component.components, Icon, Badge: VPBadge };
```

底层是 Vue 自身的机制，两种写法任选其一：

- **局部**：`component.components = { ...component.components, ...HOST_COMPONENTS }`，只对这一个 markdown 组件生效。
- **全局**：在 `createApp` 之后、`mount` 之前注册，整个 app 通用：

  ```js
  const app = createApp({ render: () => h(component) });
  app.component('Icon', Icon); // 之后任意组件的模板里都能写 <Icon>
  app.component('Badge', MyBadge);
  app.mount(document.getElementById('app'));
  ```

两者不要混用；`<Icon>` 只要能被模板解析到即可，与图标数据注册（`addCollection` / `addIcon`）是两回事——后者是往图标仓库塞 svg，和组件注入互不影响。

## 大纲

右侧“大纲”栏由 `buildOutline(headings)` 从渲染源（`demo.md`）的 h2–h6 生成，在 demo 里增删二级/三级标题可以看到它同步更新。它的尺寸、层级与状态取值与 VitePress 的 `VPDocAsideOutline` / `VPDocOutlineItem` 一致：1px 发丝线、1rem 内缩、链接 14px / 行高 2.2857143、当前项取 `--vp-c-text-1`，另带图样相同的 2px `.outline-marker`。

当前项由宿主做滚动同步：给链接加 `.active`（或 `aria-current="location"`），并把 `.outline-marker` 的 `top`、`opacity` 设到对应位置；demo 实现见 `index.html` 的内联脚本。

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

## 公共 API

包入口共八个导出：

- 配置：`createConfig`、`assertConfigCompatible`（单例配置冲突告警）
- 渲染：`renderMarkdown`（markdown → HTML，KaTeX 已内部渲染）、`createMarkdownComponent`（markdown → Vue 组件）、`buildOutline`
- 代码块：`highlightBlock`
- 就绪：`ensureMarkdownReady`（挂载可选 emoji，幂等）
- 底层：`md`（共享的 markdown-it 实例，需要自己 `parse` token 时用）

图表相关配置：`mermaidDriver`（`pele` | `mermaid`）与 `echarts: { height }`（默认 400）。

`renderMarkdown(source, { dir, config })` 异步返回 `{ html, headings }`，**不等待 emoji 挂载**（首次渲染可能未启用 emoji，需要就绪先 `await ensureMarkdownReady()`）；`createMarkdownComponent` 会先等待 emoji 就绪。`md` 是模块级单例，**一个进程只服务一套配置**——但这是实现现状、不是架构必然：真正把配置锁死成“首份生效”的只有三处改了 `md` 实例本身的操作（`mark/sub/sup` 的 `ruler.disable`、自定义容器累积注册、emoji 的 `md.use`），其余配置（`dir` / `adapters` / `level` / `lineNumbers` 等）都经每次渲染的 `env` 隔离、本身可多配置共存。切换会影响渲染的配置时 `assertConfigCompatible` 会 `console.warn`，且仅首份配置生效；SPA 多实例、测试隔离、热更新、多站点复用受此限制，属于可偿还的实现债（中期方向 `createMarkdownRenderer(config)` 工厂）。

## 开发

```sh
npm install          # 安装依赖
npm run build        # dist/index.js、dist/index.min.js、两份 CSS，外加 Vite 构建的自包含 demo（index.html + assets、public/、demo.md）
npm run dev          # Vite 开发服务（根目录 index.html，引用 src 源码，改源码即时生效）
npm run build && npm run preview    # 构建后预览 dist（http://127.0.0.1:4173）
npm test             # 运行 node:test 测试
npm run lint         # eslint 检查（--max-warnings 0）
npm run lint:fix     # eslint 自动修复
```

demo 只有这一种形态，整页自包含：`index.html` 一个文件集齐骨架、内联样式（宿主侧 `.vp-doc` 外壳）、内联脚本（宿主组件 `VPBadge` + 左编辑右预览逻辑）。dev 由 Vite 重写裸导入直跑源码；build 由 Vite 打进 `dist/`（所有依赖含 mermaid 异步 chunk、KaTeX 字体都在产物里），preview 与 GitHub Pages 消费的同一份产物。渲染源是仓库根目录的 `demo.md`（构建时拷成 `dist/demo.md`，运行时 `fetch`——换名是为了不让 `files` 白名单把 dist 里的示例源带进 npm 包），改 `demo.md` 要重新 `npm run build`。左列 textarea 编辑（输入防抖 400ms 实时预览），右列渲染结果，最右是大纲。

`npm run build` 由 `scripts/build.mjs` 驱动：先用 Vite 8（rolldown）产出库文件 `dist/index.js` / `dist/index.min.js` 与两份 CSS，再把同一份源码打进自包含 demo（`dist/index.html` + `assets/`、`public/`、`demo.md`）。宿主项目可以直接 `import 'mdi2esm'` 交给打包器处理；不打包时也可用 import map 手动映射 peer，见「不打包：浏览器原生 ESM + importmap」。

## 发布说明

`package.json` 中的 `repository` / `homepage` / `bugs` 指向 `https://github.com/nbaxp/mdi2esm`。

发布由 `.github/workflows/publish.yml` 承载：推送 `v*` Tag 时，工作流依次安装依赖、lint、构建、测试，再用 OIDC Trusted Publisher 执行 `npm publish`，随后把 `dist` 部署到 `gh-pages`。`dist` 被 gitignore、由 `npm run build` 生成，无需提交。

### 首次发布（新包）

CI 的 `npm publish` 走 OIDC Trusted Publisher，但**新包尚未发布时，npm 侧没有 Settings 页面，无法预先配置 Trusted Publisher**。因此首次推 Tag 会在 Publish 步骤返回 `404 Not Found`（不是包内容问题，前面 lint/build/test 都会通过）。首次发布须按顺序：

1. 本地 `npm login`（需 npm 账号 2FA），然后 `npm publish --otp=<OTP>`；`prepublishOnly` 会自动构建、测试、lint。
2. 包发布后，到 https://www.npmjs.com/package/<包名>/settings/access → Trusted Publisher → GitHub Actions，填 owner、repo、workflow `publish.yml` 保存。
3. 之后推 `v*` Tag 即可由 CI 用 OIDC 自动发布，无需 OTP。

### 后续发版

1. 修改 `package.json` 的 `version` 并提交。
2. `git tag vX.Y.Z && git push origin main vX.Y.Z`。
3. 工作流自动完成 lint、构建、测试、发布，并把 demo 部署到 `gh-pages`。
