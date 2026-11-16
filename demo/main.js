// demo 入口：mdi2esm 自带样式 + KaTeX 样式 + 完整渲染管线演示。
import '../src/styles/index.css';
import 'katex/dist/katex.min.css';
import './demo.css';

import { createApp, h } from 'vue';

import { buildOutline, createConfig, createMarkdownComponent } from '../dist/index.min.js';
// 独立 md 源文件，作为可编辑示例的初始值
import sample from './sample.md?raw';
// 宿主提供的组件（mdi2esm 不内置 Badge），演示由宿主注入
import { VPBadge } from './vp-badge.js';

const ta = document.getElementById('src');
const content = document.getElementById('content');
const outline = document.getElementById('outline');
ta.value = sample;

// 自定义容器：由 config 驱动（非纯 Markdown 语法），演示 ::: demo
const config = createConfig({
  markdown: {
    lineNumbers: false,
    container: [{ type: 'demo', title: '自定义容器' }],
  },
});

let app = null;
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

async function run() {
  // 完整管线：frontmatter / Prism 高亮 / KaTeX / script setup / 容器 全部在此完成
  const { component, headings } = await createMarkdownComponent(ta.value, '', config);
  if (app) app.unmount();
  content.innerHTML = '';
  if (component) {
    // 组件注册注入：mdi2esm 只负责 markdown → 组件编译，
    // Badge 这类主题组件由宿主合并进渲染管线
    component.components = {
      ...(component.components || {}),
      Badge: VPBadge,
    };
    app = createApp({ render: () => h(component) });
    app.mount(content);
  }
  outline.innerHTML = '';
  createTitle(outline);
  createMarker(outline);
  renderOutline(buildOutline(headings), outline);
  collectOutlineTargets();
  scheduleActive();
}

function fail(err) {
  content.textContent = '渲染失败：' + err.message;
  console.error(err);
}

document.getElementById('render').addEventListener('click', () => {
  run().catch(fail);
});
document.getElementById('toggle-theme').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
});

run().catch(fail);
