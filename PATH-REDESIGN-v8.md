# MdViewer 路径与 URL 处理规范（v8）

> 基于 v7 修复精简。修复：删 §5.3 跨语言链接示例（违反“md 内不写语言段”，非默认语言页会算出双前缀）；文档资源从 `docsRouterPath` 改走 `docStaticPath`（SPA 路由无物理文件，资源须与 md 同源）；md 源文件公式加 `docFilePath` 处理目录首页；文档链接公式改用 `resolvedPath`（目标路径而非当前路径）。精简：合并重复配置块与示例表；删 `locales`（统一 lang / URL 段 / 目录名）；删 `publicPaths`（相对 / 绝对 URL 直接分流）。明确：`.md` 结尾一律按文档链接，不论相对还是根绝对。默认语言是否省略路由语言段由 `omitDefaultLang` 控制；语言标识集合由宿主提供；文档链接保留目录尾斜杠；`resolvedPath` 只取 URL 的 pathname。
>
> 核心原则：只有 md 源文件按语言分目录（默认语言也有独立目录）；图片、附件等资源共享，不按语言分目录；文档路由、内容资源、公共资源三者前缀分离；MdViewer 只做 URL 解析，不依赖 vue-router，也不负责物理文件映射。

## 1. 配置

| 配置                  | 默认       | 说明                                                           |
| --------------------- | ---------- | -------------------------------------------------------------- |
| `i18nEnabled`         | `false`    | 是否启用多语言                                                 |
| `omitDefaultLang`     | `true`     | 默认语言是否在路由中省略 lang 段；仅 `i18nEnabled=true` 时有效 |
| `urlTransformEnabled` | `true`     | 是否转换 md 内 URL                                             |
| `routerBase`          | `/`        | 宿主部署前缀，以 `/` 开头和结尾                                |
| `docsRouterPath`      | `/docs`    | 文档路由前缀，不含 base，可为 `/`                              |
| `docStaticPath`       | `/content` | md 源文件与文档资源的 URL 前缀，不含 base、不含语言            |
| `defaultLang`         | `zh-CN`    | 默认语言标识，与 `omitDefaultLang` 共同决定路由是否带语言段    |
| `langs`               | `[]`       | 有效语言标识集合，供路由语言段识别；不是 lang → 目录名映射表   |
| `lang`                | `null`     | 当前语言标识，由宿主 i18n 提供；为空时从路由首段推导           |
| `routeFullPath`       | `/`        | 当前文档路由，不含 `routerBase`、query、hash                   |

除 `lang` 与 `routeFullPath` 是当前页状态外，其余为站点级配置；十项均作为 `paths` 对象字段由宿主一次注入 `createConfig({ paths })`，实现见 `DEFAULT_PATHS`。

语言标识 (`lang`) 同时用作 URL 段和 md 物理目录名，三者统一——不再维护 `lang` → 目录名的映射表。这要求宿主把 i18n 标识与目录名对齐（如目录直接用 `en-US` 而非 `en`）。`omitDefaultLang` 只影响路由，不影响 md 物理路径：无论取何值，`lang` 始终参与 md 源文件目录。宿主除当前 `lang` 外还需提供**有效语言标识集合** `langs`（如 `['zh-CN','en-US']`）供路由语言段识别用；这只是标识列表，不是映射表，与 `lang` / `routeFullPath` 同属 `paths` 对象字段，不构成独立的映射配置。

## 2. 路径变量

- `routeFullPath`：当前文档路由，不含 `routerBase`、query、hash。
- `lang`：当前语言标识，取自宿主 i18n，等于 URL 段与目录名；默认语言也有（= `defaultLang`）。
- `routeLang`：路由中写入的语言段，为空表示不写。`i18nEnabled=false` 或（`omitDefaultLang=true` 且 `lang=defaultLang`）时为空，否则为 `lang`。
- `docPath`：去掉 `docsRouterPath`、去掉 `routeLang` 段后的逻辑路径，不含 `.md`。
- `docDir`：`docPath` 的目录，以 `/` 开头和结尾，根为 `/`；不含 `lang`。
- `docFilePath`：`docPath` 以 `/` 结尾时为 `docPath + 'index'`，否则 `docPath`（目录首页归一）。
- `resolvedPath`：每个链接 URL 的 **pathname** 解析后的逻辑绝对路径，以 `/` 开头，不含 `lang` / `routerBase` / 任一路径前缀、query、hash；相对 URL 基于 `docDir` 解析，绝对 URL 基于文档根解析。

前六项描述当前文档，`resolvedPath` 在解析每个链接时产生。

## 3. 四条公式

```text
md 源文件  = join(routerBase, docStaticPath, lang, docFilePath + '.md')
文档链接   = join(docsRouterPath, routeLang, 去 .md 并归一 index 的 resolvedPath)
文档资源   = join(routerBase, docStaticPath, resolvedPath)   // 相对 URL，不含 lang
公共资源   = join(routerBase, path)                         // 绝对 URL
```

`lang` 对默认语言同样参与 md 源文件物理路径；路由上是否出现语言段只看 `routeLang`。`join` 去掉重复 `/`，根 `/` 视为空段，结果以 `/` 开头。文档链接是目录路由时**保留末尾 `/`**（如 `/help/`、`/help/en-US/guide/`），根文档路由为 `/`；其他 URL 不强制保留尾斜杠。md 源文件与文档资源同走 `docStaticPath`，但只有源文件带 `lang`（资源共享，资源不带）；公共资源只带 `routerBase`，不含 `docsRouterPath`、`docStaticPath`、`lang`、`docDir`（拼接 `routerBase` 是 MdViewer 主动加的部署前缀，不是浏览器对根绝对 URL 的原生解释）。

## 4. 路径解析

1. `routeFullPath` 去掉 `docsRouterPath`（边界匹配；`/` 为特例，不剥离，语言段仍从路由第一段开始识别）。
2. `i18nEnabled` 时，若第一段命中宿主提供的有效语言标识则取为当前语言并剥离，否则用 `defaultLang`：`omitDefaultLang=true` 时只识别非默认语言（默认语言段不出现），`false` 时识别全部语言（无语言段时兜底 `defaultLang`）。宿主提供的语言标识集合即识别依据，MdViewer 不维护任何目录映射。语言段优先于文档首段：`omitDefaultLang=false` 若语言集合含 `guide`，`/help/guide/` 会解析为语言 `guide` 而非默认语言下的 guide 文档——这是路径歧义，由宿主保证语言标识与文档一级目录不重名即可，无需新增配置。
3. 剩余为 `docPath`。以 `/` 结尾时 `docDir = docPath`，否则取其最后一个 `/` 之前的部分，根为 `/`；由 `docPath` 得 `docFilePath`。
4. 链接 URL 解析为 `resolvedPath`：相对基于 `docDir`、绝对基于文档根；`.`、`..` 规范化，不得越过根。
5. `resolvedPath` 以 `.md` 结尾时去后缀（若为 `index` 则归一为所在目录）得到文档链接的逻辑路径。

当前路由解析与 Markdown 链接解析是两套独立逻辑：SPA 当前路由不带 `.md`，`.md` 处理只发生在链接解析（第 5 步）。

## 5. URL 转换

`urlTransformEnabled=false` 时全部原样（相对 `.md` 会请求源文件，属预期行为）。

启用时先分离 pathname / query / hash，再按序分类：

1. 外链、`//` 协议相对、`mailto:` / `tel:` / `data:`、纯片段 `#` → 原样保留。
2. pathname 以 `.md` 结尾 → 文档链接（只看 pathname；相对与根绝对同样处理；`index.md` 归一为目录）。
3. 其余相对 URL → 文档资源（按 §3 公式，走 `docStaticPath`）。
4. 其余绝对 URL → 公共资源。

query 与 hash 不参与分类和规范化，转换后原样保留；不得解码 `%2F`。第 2 条优先于 3、4：`.md` 结尾者一律是文档链接；非 `.md` 时相对 / 绝对的判定以原始 URL 为准——`./img/a.png` 走文档资源，`/img/a.png` 走公共资源。

## 6. 库内资源与脚本导入

除 §5 的 md 内 URL 转换外，解析器还提供两个专用函数，供渲染层的 `config.adapters` 使用：

- `resolveResource({ file, spec })`：`<<<` / `@include` / 地图 GeoJSON 等库内 fetch。目标取 `spec ?? file`；外链时原样返回该目标，否则拼接 `join(routerBase, docStaticPath, file)`。`file` 是 source-expander 基于不含 `lang` 的逻辑路径算出的站点相对路径，因此库内资源与文档资源同源、共享、不带 `lang`；`spec` 只决定外链判定与外链返回值，不参与本地 URL 拼接。
- `toScriptImport({ spec, resolved })`：`<script setup>` 中 import 说明符绝对化（Blob 模块没有相对基准）。外链原样返回；`./` / `../` 开头的相对说明符用已按当前目录归一的 `resolved`，与 `/` 开头的绝对说明符一样只加 `routerBase`，不叠加 `docsRouterPath` / `docStaticPath` / `lang`；裸包名原样交给 importmap。

两者经 `createPathAdapters(paths)` 暴露为 `config.adapters.resolveResource` / `config.adapters.toScriptImport`；`fetcher` 与 `scriptContext` 保持 base 模式不变。`createConfig({ paths })` 存在时走本模型，否则维持 base 模式，两种模式都允许 `adapters` 定点覆写。

## 7. 导航

宿主提供 `navigate(to)` 时，普通左键点击站内文档链接调用它；修饰键、中键、`target="_blank"`、`download`、外链不拦截。未提供时保留原生 `<a href>`。导航是宿主职责，库内不实现拦截，因此本规范不为它定义库级测试。

## 8. 对照示例

配置：`routerBase=/app/`、`docsRouterPath=/help`、`docStaticPath=/content`、`defaultLang=zh-CN`、`omitDefaultLang=true`

| 当前路由                                        | `/help/guide/`                      | `/help/en-US/guide/`                |
| ----------------------------------------------- | ----------------------------------- | ----------------------------------- |
| 语言                                            | `zh-CN`                             | `en-US`                             |
| `routeLang`                                     | 空                                  | `en-US`                             |
| `docPath`                                       | `/guide/`                           | `/guide/`                           |
| `docFilePath`                                   | `/guide/index`                      | `/guide/index`                      |
| md 源文件                                       | `/app/content/zh-CN/guide/index.md` | `/app/content/en-US/guide/index.md` |
| `./intro.md` → `resolvedPath=/guide/intro.md`   | `/help/guide/intro`                 | `/help/en-US/guide/intro`           |
| `/api/auth.md` → `resolvedPath=/api/auth.md`    | `/help/api/auth`                    | `/help/en-US/api/auth`              |
| `./img/a.png` → `resolvedPath=/guide/img/a.png` | `/app/content/guide/img/a.png`      | `/app/content/guide/img/a.png`      |
| `/img/logo.png`                                 | `/app/img/logo.png`                 | `/app/img/logo.png`                 |

`omitDefaultLang=false` 时，左列文档链接变为 `/help/zh-CN/guide/intro`、`/help/zh-CN/api/auth`，`routeLang=zh-CN`（解析时 `/help/zh-CN/guide/` 识别为默认语言）；md 源文件与资源两行不变。`resolvedPath=/index.md` 归一后文档链接为 `/help/`，保留末尾 `/`。

宿主职责：按语言标识命名 md 语言目录（与 i18n 标识一致）；提供当前 lang 与有效语言标识集合；从 `docStaticPath` 同时提供 md 与文档资源（图片等共享、不分语言），该静态映射优先于 SPA 路由回退。
