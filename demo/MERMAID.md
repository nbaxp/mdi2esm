# demo：mermaid 外置拆解说明

这份说明记录 `demo/npm2esm/config.js` 中 mermaid 拆解的由来和实测结果。它是 demo 的定制方案，不是 npm2esm 的通用规则。

## 当前双驱动

mdi2esm 默认使用 **Pele** 渲染 Mermaid 语法，可通过配置切换为原生 Mermaid：

```js
createConfig({ mermaidDriver: 'pele' }); // 默认
createConfig({ mermaidDriver: 'mermaid' });
```

只有这两个驱动，没有 auto，也不会在 Pele 失败后自动调用 Mermaid。demo 顶部的“图表驱动”选择器会重新编译当前 Markdown，让已有图表切换到所选驱动。

Pele 使用完整的 `pele` 入口，由 npm2esm 自动构建为 `lib/pele/index.min.js`，实际大小 **712.3 KiB**。它是零依赖单文件，不参与下面 20 个 Mermaid 三方依赖的拆解。默认 Pele 模式不请求 Mermaid；切到 Mermaid 后才按需加载下面的 Mermaid 产物及其依赖。

## 构建方式

demo 是独立 npm 工作区，`mdi2esm` 通过 `file:..` 安装到 `demo/node_modules`。

所有需要独立产物的包都声明在 `demo/package.json` 的 `dependencies` 中，构建命令只有：

```sh
npm2esm .
```

不要在命令后维护一长串包名。npm2esm 默认读取 `dependencies`，`config.js` 只负责入口、复制文件、external 等构建配置。external 的包如果没有对应依赖声明、构建产物和 importmap 条目，浏览器会在运行时解析失败。

从 mdi2esm 根目录执行：

```sh
npm run demo:esm:build
npm run demo:esm
```

## 最终拆解范围

mermaid 12.3.0 有 22 个直接依赖，最终外置其中的 **20 个运行时依赖**：

- `@types/d3` 只有类型，没有运行时代码，不需要外置。
- `@mermaid-js/parser` 是 mermaid 自己的语法包，留在 mermaid 产物中。
- 其余 20 个三方运行时依赖全部外置，包括 `d3-sankey`。
- 不递归拆解 `layout-base`、`cose-base`、`lodash-es` 等间接依赖。
- 不采用 splitting，不删除或 stub 任何图表类型。

## 最终独立产物的实际大小

以下是 `demo/lib` 中实际生成的 JS 文件大小，单位为 KiB；不是根据 mermaid 的体积差反推的值。按产物大小降序排列。

| 外置包                    | 独立产物                                       |   实际大小 |
| ------------------------- | ---------------------------------------------- | ---------: |
| `elkjs`                   | `elkjs/lib/elk.bundled.js`                     |     1458.2 |
| `cytoscape`               | `cytoscape/index.min.js`                       |      440.6 |
| `d3`                      | `d3/index.min.js`                              |      276.1 |
| `katex`                   | `katex/index.min.js`                           |      262.1 |
| `cytoscape-fcose`         | `cytoscape-fcose/index.min.js`                 |      122.5 |
| `chevrotain`              | `chevrotain/index.min.js`                      |      110.9 |
| `dagre-d3-es`             | `src/dagre/index.js` + `src/graphlib/index.js` |       87.6 |
| `es-toolkit`              | `es-toolkit/compat/index.js`                   |       76.7 |
| `cytoscape-cose-bilkent`  | `cytoscape-cose-bilkent/index.min.js`          |       76.5 |
| `@iconify/utils`          | `@iconify/utils/index.min.js`                  |       47.9 |
| `marked`                  | `marked/index.min.js`                          |       38.9 |
| `dompurify`               | `dompurify/index.min.js`                       |       29.9 |
| `roughjs`                 | `roughjs/index.min.js`                         |       26.7 |
| `@upsetjs/venn.js`        | `@upsetjs/venn.js/index.min.js`                |       20.1 |
| `dayjs`                   | 入口 + 4 个插件，共 5 个 JS 文件               |       18.0 |
| `khroma`                  | `khroma/index.min.js`                          |       11.7 |
| `stylis`                  | `stylis/index.min.js`                          |        9.6 |
| `d3-sankey`               | `d3-sankey/index.min.js`                       |        8.2 |
| `@braintree/sanitize-url` | `@braintree/sanitize-url/index.min.js`         |        2.4 |
| `ts-dedent`               | `ts-dedent/index.min.js`                       |        0.8 |
| **合计**                  | **20 个外置包**                                | **3125.4** |

最终 `mermaid/index.min.js` 为 **2335.7 KiB**。mermaid 与这 20 个独立 JS 产物合计 **5461.1 KiB**。

这里有两个不同指标，不能混用：

- mermaid 单文件从 **5251.4 → 2335.7 KiB**，减少 **2915.7 KiB（约 55.5%）**。
- 全部独立产物直接相加，比原单文件多 **209.7 KiB**。原因是独立包要提供完整入口和导出，而内联进 mermaid 时 esbuild 可以摇掉未使用代码。例如 `d3` 独立产物为 276.1 KiB，但它在逐步试验中只让 mermaid 减少约 143.6 KiB。

以上合计只用于比较磁盘产物，不表示打开默认页面会下载全部文件；实际请求时机见“关于加载时机”。

## 初次逐项试验记录

以下记录第一次按体积从大到小逐项试验时的 `demo/lib/mermaid/index.min.js` 大小，单位为 KiB。每一步的默认 mermaid 示例均渲染通过。

这张表保留试验过程，**不是最终 external 清单**：步骤 5、7、8 是后来确认冗余的间接依赖，步骤 22 是无效项，均已从最终 `mermaid.external` 删除。

| 步骤 | 本次加入的 external                   | mermaid 大小 | 本次变化 |
| ---- | ------------------------------------- | -----------: | -------: |
| 默认 | 无                                    |       5251.4 |        — |
| 1    | `elkjs/*`                             |       3745.3 |  -1506.2 |
| 2    | `cytoscape`                           |       3300.0 |   -445.9 |
| 3    | `katex`                               |       3033.2 |   -266.9 |
| 4    | `d3`                                  |       2889.7 |   -143.6 |
| 5    | `layout-base`（后删除）               |       2781.2 |   -108.5 |
| 6    | `chevrotain`                          |       2672.8 |   -108.4 |
| 7    | `cose-base`（后删除）                 |       2609.0 |    -63.5 |
| 8    | `lodash-es`（后删除）                 |       2570.2 |    -38.8 |
| 9    | `marked`                              |       2530.9 |    -39.0 |
| 10   | `dagre-d3-es/*`                       |       2496.1 |    -34.8 |
| 11   | `dompurify`                           |       2464.6 |    -31.6 |
| 12   | `roughjs`                             |       2439.1 |    -25.5 |
| 13   | `cytoscape-fcose`                     |       2418.6 |    -20.4 |
| 14   | `@upsetjs/venn.js`                    |       2399.2 |    -19.4 |
| 15   | `dayjs`、`dayjs/*`                    |       2381.5 |    -18.0 |
| 16   | `khroma`                              |       2371.7 |     -9.9 |
| 17   | `es-toolkit/*`                        |       2362.3 |     -9.4 |
| 18   | `@iconify/utils`                      |       2357.8 |     -4.5 |
| 19   | `@braintree/sanitize-url`             |       2355.9 |     -1.9 |
| 20   | `ts-dedent`                           |       2355.2 |     -0.2 |
| 21   | `cytoscape-cose-bilkent`              |       2348.2 |     -7.0 |
| 22   | `@chevrotain/*`（无效，后删除）       |       2348.2 |        0 |
| 23   | `stylis`                              |       2344.2 |     -3.9 |
| 修正 | 补 `d3-sankey`，删除 3 个冗余间接依赖 |       2335.7 |     -8.5 |

`d3-sankey` 是初次试验漏掉的直接依赖。补上后 mermaid 减少 8.5 KiB，其独立产物实际为 8.2 KiB；默认流程图和 Sankey 图均已单独渲染验证通过。

## 配置上的特殊点

### 间接依赖不进入 `mermaid.external`

三个间接依赖的来源是：

- `dagre-d3-es` → `lodash-es`
- `cytoscape-fcose` → `cose-base@2` → `layout-base@2`
- `cytoscape-cose-bilkent` → `cose-base@1` → `layout-base@1`

初次试验在父包尚未全部外置时加入它们，所以中间步骤能看到体积下降。父包全部外置后，esbuild 不再向父包内部展开，这三项对最终 mermaid 产物就没有作用。

最终构建还检查了整个 `demo/lib`，没有任何 JS 文件静态或动态导入 `layout-base`、`cose-base`、`lodash-es`。因此这三个无用产物及其 `dependencies`、`config.js` 任务均已删除，最终构建为 27 个包、34 条 importmap 条目，而不是试验阶段的 30 个包、37 条。

### `@chevrotain/*` 无效

mermaid 裸导入的是聚合包 `chevrotain`，不是 `@chevrotain/*` 子包。子包已经包含在 chevrotain 自己的构建产物中，因此把 `@chevrotain/*` 加入 mermaid 的 external 不会减小产物，最终配置只保留 `chevrotain`。

### `ts-dedent` 的收益已被前序步骤覆盖

`ts-dedent` 也是 chevrotain 的依赖。在外置 `chevrotain` 时，它的大部分体积已经随 chevrotain 离开 mermaid 产物，所以后面单独外置 `ts-dedent` 只再减少约 0.2 KiB。它的完整独立产物实际为 0.8 KiB。逐项体积变化不能理解为该包完整的独立大小。

### `stylis` 必须同时有产物和 importmap 条目

`stylis` 是 mermaid 的裸导入，但 demo 最初没有为它声明依赖和构建任务。只加 external 会导致运行时无法解析；补齐 `dependencies`、`config.js` 任务并重新完整构建后才通过。

这说明添加 external 前必须先确认对应包的独立产物和映射，而不是等浏览器报错后补救。

### `@braintree/sanitize-url` 需要命名导出 wrapper

该包只有 CommonJS 分发，mermaid 使用命名导入 `sanitizeUrl`。直接让 esbuild 打包不能得到浏览器需要的同名 ESM 导出，因此使用 `entries/sanitize-url.js`：

```js
export { sanitizeUrl } from '@braintree/sanitize-url';
```

再由 npm2esm 把这个入口构建成 ESM 产物。

### dayjs 插件不能省略

mermaid 的甘特图不仅导入 `dayjs`，还导入：

- `dayjs/plugin/isoWeek.js`
- `dayjs/plugin/customParseFormat.js`
- `dayjs/plugin/advancedFormat.js`
- `dayjs/plugin/duration.js`

所以 external 同时包含 `dayjs` 和 `dayjs/*`，dayjs 的构建配置也必须生成这四个插件。只提供 `dayjs/index.min.js` 会导致甘特图相关模块 404。表中的 18.0 KiB 是入口和四个插件的合计。

### elkjs 使用 bundled 变体

mermaid 的裸导入是 `elkjs/lib/elk.bundled.js`，不是仅含 API 的 `elk-api.js`。demo 因此把该 bundled 文件构建为独立 ESM 产物，并依赖 `elkjs/` 前缀映射解析。没有改用 worker 方案，也没有删除 ELK 布局能力。

## 关于加载时机

`external` 只表示“不内联进 mermaid 单文件”，不等于“一定按需加载”。浏览器何时请求某个独立产物，取决于 mermaid 原有的静态/动态导入方式以及 esbuild 的最终输出；需要按具体图表和浏览器 Network 记录判断，不能只凭 external 清单下结论。

逐步试验的通过标准是：默认 demo 的 mermaid 示例成功生成 SVG、没有回退为源码、控制台无错误。最终修正后又单独验证了 Sankey 图，成功生成 SVG。以上不代表已经逐一覆盖 mermaid 的所有图表类型。

## 修改后的检查

```sh
# 在 demo 目录
npm install --install-links --no-audit --no-fund
npm run build

# 在 mdi2esm 根目录
npm run lint
```

然后打开 `http://localhost:4182/demo/`，至少确认：

1. `.mermaid-rendered` 中存在 SVG。
2. `.mermaid-source` 数量为 0。
3. 控制台无模块解析或渲染错误。
4. Network 中无 404/500。
5. 修改 `d3-sankey` 或其 external 配置时，额外渲染一个 Sankey 示例。
