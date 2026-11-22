// Markdown → Vue 组件的完整管线（移植自 mdoc 的解析方式）
// markdown → template 字符串 → Vue 运行时编译；Prism 同步高亮、KaTeX 异步增强在编译前完成
import { compile, defineComponent, Fragment, markRaw } from 'vue';
import { styleMixin } from 'vue-style-runtime';

import { assertConfigCompatible } from './config.js';
import { createEChartsBlock } from './echarts.js';
import { createEChartsTableBlock } from './echarts-table.js';
import { parseFrontmatter } from './frontmatter.js';
import { mountImageZoom } from './image-zoom.js';
import { ensureEmojiPlugin } from './markdown-it.js';
import { createScriptModule, createSetup } from './markdown-script.js';
import { createMermaidBlock } from './mermaid.js';
import { escapeInvalidInterpolations, renderMarkdown } from './render.js';
import { expandSource } from './source-expander.js';

// 多根（Fragment）组件的 this.$el 只指向第一个根节点；这里从 subTree 收集全部根元素，
// 供 mountImageZoom 等需要遍历组件 DOM 的逻辑使用。
function collectComponentRoots(instance) {
  const subTree = instance.$.subTree;
  if (!subTree) return [];
  if (subTree.type === Fragment && Array.isArray(subTree.children)) {
    return subTree.children.map((child) => child?.el).filter((el) => el && el.nodeType === 1);
  }
  return subTree.el && subTree.el.nodeType === 1 ? [subTree.el] : [];
}

// 剥离第一个顶级的 <script>（页面级脚本，围栏内的不动），style 块全部剥离经 styleMixin 注入组件。
// 页面级脚本只会有一个：其后正文里出现的 <script> 属于文档内容，原样保留不剥离。
// <script setup> 拼成 ESM 模块执行（见 ./markdown-script.js），普通 <script> 默认导出并入组件选项。
export function extractTopLevelBlocks(raw, { extractScripts = true } = {}) {
  const lines = raw.split(/\r?\n/);
  const body = [];
  // lineMap[i]：body 第 i 行在 raw 中的行号（1-based），供 headings 还原原文行号
  const lineMap = [];
  const scripts = [];
  const styles = [];
  let fence = null;
  const readBlock = (from, closeRe) => {
    const content = [];
    let i = from + 1;
    while (i < lines.length && !closeRe.test(lines[i])) {
      content.push(lines[i]);
      i += 1;
    }
    return { content: content.join('\n'), end: i };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence) {
      if (line.trim() === fence) fence = null;
      body.push(line);
      lineMap.push(i + 1);
      continue;
    }
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      fence = fenceMatch[1];
      body.push(line);
      lineMap.push(i + 1);
      continue;
    }
    // 只认第一个 <script>：其后正文里的 <script> 是文档内容，不剥离
    const script = extractScripts && scripts.length === 0 && /^<script([^>]*)>/.exec(line);
    if (script) {
      const block = readBlock(i, /^<\/script>/);
      scripts.push({ attrs: script[1], content: block.content });
      i = block.end;
      continue;
    }
    const style = /^<style([^>]*)>/.exec(line);
    if (style) {
      const block = readBlock(i, /^<\/style>/);
      styles.push({ attrs: style[1], content: block.content });
      i = block.end;
      continue;
    }
    body.push(line);
    lineMap.push(i + 1);
  }
  return { body: body.join('\n'), scripts, styles, lineMap };
}

/**
 * 普通 <script> 的默认导出（选项对象）并入文档组件；render/template 属于 markdown 正文，忽略。
 */
function mergeScriptOptions(options, def) {
  const { mounted, ...rest } = def;
  delete rest.render;
  delete rest.template;
  Object.assign(options, rest);
  // script 自带 mounted 时排在管线 mounted（图片缩放初始化）之后
  if (typeof mounted === 'function') {
    const pipelineMounted = options.mounted;
    options.mounted = function () {
      pipelineMounted?.call(this);
      mounted.call(this);
    };
  }
}

/**
 * Markdown 文本 → Vue 组件。
 * @param {string} source Markdown 原文
 * @param {string} dir Markdown 文件所在目录（相对站点根，用于相对链接解析）
 * @param {object} config 渲染配置（由宿主壳经 createConfig 构造）
 * @param {object} [options]
 * @param {object} [options.frontmatter] 宿主已解析的 frontmatter（优先于内置解析）
 * @param {object} [options.params] 页面参数，供 <script setup> 使用
 * @param {string} [options.sourcePath] 当前文件相对站点根的物理路径；提供时在渲染前展开 <<< / @include
 * @returns {Promise<object|null>} 组件定义；空正文返回 null
 */
export async function createMarkdownComponent(source, dir, config, { frontmatter, params, sourcePath } = {}) {
  assertConfigCompatible(config);
  // 浏览器端 <<< / @include 展开：仅当宿主给出 sourcePath 时启用（默认行为不变）。
  // 展开在 frontmatter 解析之前完成，stripFrontmatter 由 expandSource 内部负责。
  if (sourcePath != null) {
    source = await expandSource(source, sourcePath, { base: config?.markdown?.include?.base ?? '/' });
  }
  // frontmatter：宿主显式传入优先，否则用（可替换的）内置子集解析器
  const parse = config?.markdown?.frontmatterParser ?? parseFrontmatter;
  const parsed = parse(source);
  const data = frontmatter ?? parsed.data;
  // markdown.scripts === false：不提取也不执行 <script>（严格模式），第一个 <script> 留在正文
  const { body, scripts, styles, lineMap } = extractTopLevelBlocks(parsed.body, {
    extractScripts: config?.markdown?.scripts !== false,
  });
  // markdown-it-emoji 不内置：装了就挂上（幂等），没装静默跳过，渲染结果不受影响
  if (!body.trim()) return { component: null, headings: [] };
  await ensureEmojiPlugin();
  // lineMap 是 body 每行在 parsed.body 中的行号，叠加 frontmatter 偏移得到原文行号
  const sourceLineMap = lineMap.map((n) => n + (parsed.bodyLine ?? 1) - 1);
  const { html, headings } = await renderMarkdown(body, { dir, config, lineMap: sourceLineMap });

  const options = {
    // 不给 name：这是每份 md 一次性编出来的渲染组件，同名只会在 devtools 里混淆
    // 把 frontmatter 挂到实例，使模板里的 {{ $frontmatter.xxx }} 可用
    beforeCreate() {
      this.$frontmatter = data ?? {};
    },
    render: compile(escapeInvalidInterpolations(html)),
    // ```mermaid 渲染成 <MermaidBlock>，图形由组件自己画，管线不碰 DOM
    components: {
      ClientOnly: { template: '<slot />' },
      MermaidBlock: createMermaidBlock(config?.mermaidDriver),
      EChartsBlock: createEChartsBlock(config?.echarts),
      // 表格首格 :line: 等声明渲染成 <EChartsTableBlock>，图表由组件画，管线不碰 DOM
      EChartsTableBlock: createEChartsTableBlock(config?.echarts),
    },
    // 图片缩放：medium-zoom 动态加载，仅当正文有可放大图片时挂载
    async mounted() {
      // 多根组件 this.$el 只指向第一个根，取全部根节点，多份 md 同页互不干扰
      await mountImageZoom(collectComponentRoots(this)).catch(() => {});
    },
  };
  // 普通 <script>：默认导出选项对象（components/data/methods…）并入组件，正文即可用其注册的组件标签
  try {
    const def = await createScriptModule(scripts, dir, config);
    if (def) mergeScriptOptions(options, def);
  } catch (err) {
    console.warn('[mdi2esm] <script> 选项合并失败：', err);
  }
  if (styles.length) {
    options.mixins = [styleMixin];
    options.styles = styles.map((item) => `<style${item.attrs}>${item.content}</style>`).join('\n');
  }
  // <script setup>：拼成 ESM 模块执行，导出的绑定可直接在正文模板里使用；失败降级为无脚本渲染
  try {
    const setup = await createSetup(scripts, dir, data, params, config);
    if (setup) options.setup = setup;
  } catch (err) {
    console.warn('[mdi2esm] <script setup> 执行失败：', err);
  }
  return { component: markRaw(defineComponent(options)), headings };
}
