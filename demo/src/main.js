// ES module 版 demo 的入口：所有依赖都是裸导入，由 demo/importmap.js 映射到 ./lib。
// 与根目录 index.html 里的内联脚本逻辑一致，差别只有示例源改成固定取 ./README.md
// （没有 Vite 的 import.meta.env）。
import { Icon } from '@iconify/vue';
import { buildOutline, createConfig, createMarkdownComponent } from 'mdi2esm';
import { createApp, h, nextTick, shallowRef, watch } from 'vue';
import styleMixin from 'vue-style-runtime';

// 宿主侧的徽标组件（复制自 mdoc 的 theme/components/VPBadge.js）。
// mdi2esm 不内置 Badge：宿主提供组件，编译后经渲染组件的 components 注入。
const BADGE_CSS = `
.VPBadge {
  display: inline-block;
  margin-inline-start: 0.125rem;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  padding: 0 0.625rem;
  line-height: 1.8333333;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  transform: translateY(-0.125rem);
}

.VPBadge.small {
  padding: 0 0.375rem;
  line-height: 1.8;
  font-size: 0.625rem;
  transform: translateY(-0.5rem);
}

.VPDocFooter .VPBadge {
  display: none;
}

.vp-doc h1 > .VPBadge,
.vp-doc h2 > .VPBadge {
  margin: 0;
  margin-inline-start: 0.125rem;
  vertical-align: middle;
}

.vp-doc h2 > .VPBadge {
  padding: 0 0.5rem;
}

.vp-doc h3 > .VPBadge {
  vertical-align: middle;
}

.vp-doc h4 > .VPBadge,
.vp-doc h5 > .VPBadge,
.vp-doc h6 > .VPBadge {
  margin: 0;
  margin-inline-start: 0.125rem;
  vertical-align: middle;
  line-height: 1.5;
}

.VPBadge.info {
  border-color: var(--vp-badge-info-border);
  color: var(--vp-badge-info-text);
  background-color: var(--vp-badge-info-bg);
}

.VPBadge.note {
  border-color: var(--vp-badge-note-border);
  color: var(--vp-badge-note-text);
  background-color: var(--vp-badge-note-bg);
}

.VPBadge.tip {
  border-color: var(--vp-badge-tip-border);
  color: var(--vp-badge-tip-text);
  background-color: var(--vp-badge-tip-bg);
}

.VPBadge.important {
  border-color: var(--vp-badge-important-border);
  color: var(--vp-badge-important-text);
  background-color: var(--vp-badge-important-bg);
}

.VPBadge.caution {
  border-color: var(--vp-badge-caution-border);
  color: var(--vp-badge-caution-text);
  background-color: var(--vp-badge-caution-bg);
}

.VPBadge.warning {
  border-color: var(--vp-badge-warning-border);
  color: var(--vp-badge-warning-text);
  background-color: var(--vp-badge-warning-bg);
}

.VPBadge.danger {
  border-color: var(--vp-badge-danger-border);
  color: var(--vp-badge-danger-text);
  background-color: var(--vp-badge-danger-bg);
}
`;

const VPBadge = {
  mixins: [styleMixin],
  props: {
    text: { type: String, required: false },
    type: { type: String, required: false, default: 'tip' },
  },
  template: /* HTML */ `
    <span class="VPBadge" :class="type" dir="auto">
      <slot>{{ text }}</slot>
    </span>
  `,
  styles: /* HTML */ `<style scoped>
    ${BADGE_CSS}
  </style>`,
};

// 注入的唯一入口：md 里用到的 <Icon> / <Badge> 全在这里登记，库内一个都不含。
const HOST_COMPONENTS = { Icon, Badge: VPBadge };

const ta = document.getElementById('src');
const content = document.getElementById('content');
const outline = document.getElementById('outline');

// README.md 既是包文档，也是本 demo 可编辑示例的初始值
const readme = await fetch('../README.md', { cache: 'no-store' }).then((res) => res.text());
ta.value = readme;

// 自定义容器：由 config 驱动（非纯 Markdown 语法），演示 ::: demo
const config = createConfig({
  markdown: {
    lineNumbers: false,
    container: [{ type: 'demo', title: '自定义容器' }],
  },
});

// 页面唯一的 Vue 状态：md 文本与图表驱动。改它就会重新编译
const source = shallowRef(readme);
const driver = shallowRef('pele');
// 当前编译出来的渲染组件
const view = shallowRef(null);

let marker = null;
let spyLinks = [];
let spyTargets = [];
let spyRaf = 0;

// 大纲层级交给 .vp-doc-outline .lvl-N 控制，不写内联样式
function renderOutline(items, container, level = 2) {
  for (const it of items) {
    const a = document.createElement('a');
    a.href = it.link;
    a.textContent = it.title;
    a.className = `lvl-${Math.min(level, 4)}`;
    a.dataset.target = it.link.slice(1);
    container.append(a);
    renderOutline(it.children || [], container, level + 1);
  }
}

// 与 VitePress 的 .outline-title 对齐
function createTitle(container) {
  const title = document.createElement('div');
  title.className = 'vp-doc-outline-title';
  title.textContent = '大纲';
  container.append(title);
}

// 与 VitePress 的 .outline-marker 对齐：独立元素，由 JS 定位到当前项
function createMarker(container) {
  marker = document.createElement('div');
  marker.className = 'outline-marker';
  container.append(marker);
}

// 滚动同步：取最后一个越过容器顶部的标题，对应链接打上 .active
function collectOutlineTargets() {
  spyLinks = [...outline.querySelectorAll('a')];
  spyTargets = spyLinks.map((a) => document.getElementById(a.dataset.target));
}

function updateActive() {
  spyRaf = 0;
  if (!spyLinks.length) return;
  const threshold = content.getBoundingClientRect().top + 16;
  let index = 0;
  for (let i = 0; i < spyTargets.length; i += 1) {
    const el = spyTargets[i];
    if (el && el.getBoundingClientRect().top <= threshold) index = i;
  }
  spyLinks.forEach((a, i) => a.classList.toggle('active', i === index));

  const active = spyLinks[index];
  if (!active) return;
  if (marker) {
    marker.style.top = `${active.offsetTop + (active.offsetHeight - marker.offsetHeight) / 2}px`;
    marker.style.opacity = '1';
  }
  // 目录自身滚动时把当前项带回视野
  const viewTop = outline.scrollTop;
  const viewBottom = viewTop + outline.clientHeight;
  if (active.offsetTop < viewTop) {
    outline.scrollTop = active.offsetTop;
  } else if (active.offsetTop + active.offsetHeight > viewBottom) {
    outline.scrollTop = active.offsetTop + active.offsetHeight - outline.clientHeight;
  }
}

function scheduleActive() {
  if (spyRaf) return;
  spyRaf = requestAnimationFrame(updateActive);
}

content.addEventListener('scroll', scheduleActive, { passive: true });
window.addEventListener('resize', scheduleActive);

// 编译完得到的 headings：右侧大纲就地重建
async function onHeadings(headings) {
  outline.innerHTML = '';
  createTitle(outline);
  createMarker(outline);
  renderOutline(buildOutline(headings), outline);
  // 标题元素要等新组件 patch 进 DOM 才取得到
  await nextTick();
  collectOutlineTargets();
  scheduleActive();
}

// 文本变了就重编译：按序号丢弃过期结果，编译完再替换视图
let compileSeq = 0;
async function rebuild() {
  const seq = ++compileSeq;
  try {
    const { component, headings } = await createMarkdownComponent(source.value, '', {
      ...config,
      mermaidDriver: driver.value,
    });
    if (seq !== compileSeq) return;
    if (!component) {
      view.value = null;
      await onHeadings(headings);
      return;
    }
    component.components = { ...(component.components || {}), ...HOST_COMPONENTS };
    view.value = component;
    await onHeadings(headings);
  } catch (err) {
    if (seq === compileSeq) fail(err);
  }
}

// 整个页面只有一个 Vue 应用，视图就是每次编译出来的组件
const Root = {
  setup() {
    return () => (view.value ? h(view.value) : null);
  },
};

function fail(err) {
  content.textContent = '渲染失败：' + err.message;
  console.error(err);
}

// 挂载后由 rebuild 接管：文本变了就重编译，大纲由 onHeadings 重建
try {
  createApp(Root).mount(content);
  watch([source, driver], rebuild);
  await rebuild();
} catch (err) {
  fail(err);
}

// 左编辑右预览：输入防抖 400ms 实时刷新，文本没变时 shallowRef 不触发，不会白跑编译
let inputTimer = 0;
ta.addEventListener('input', () => {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    source.value = ta.value;
  }, 400);
});

// 「渲染」按钮：跳过防抖立即刷新
document.getElementById('render').addEventListener('click', () => {
  clearTimeout(inputTimer);
  source.value = ta.value;
});
document.getElementById('diagram-driver').addEventListener('change', (event) => {
  driver.value = event.target.value;
});
document.getElementById('toggle-theme').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
});
