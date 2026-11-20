// medium-zoom 图片点击放大（移植自 mdoc）：仅当正文有可放大图片时动态加载
// 外链包裹图与 mermaid 输出不参与；遮罩背景跟随主题 CSS 变量
import { lazyModule } from './lazy-module.js';

const loadZoom = lazyModule(() => import('medium-zoom'));

const ZOOM_CSS = `.medium-zoom-overlay { background: var(--vp-c-bg) !important; z-index: 100; }
.medium-zoom-image--opened { z-index: 101; }`;

function ensureZoomCss() {
  if (document.head.querySelector('style[data-md-medium-zoom]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-md-medium-zoom', '');
  style.textContent = ZOOM_CSS;
  document.head.append(style);
}

function zoomableImages(root) {
  return Array.from(root.querySelectorAll('img')).filter(
    (img) => !img.closest('a') && !img.closest('.mermaid-rendered'),
  );
}

// roots 可为单个根节点或数组：markdown 组件是多根（Fragment），this.$el 只指向第一个根，
// 调用方需把组件的全部根节点传进来，否则只有第一个根内的图片会被装配。
export async function mountImageZoom(roots) {
  const list = (Array.isArray(roots) ? roots : [roots]).filter(Boolean);
  if (list.length === 0) return;
  const images = list.flatMap((root) => zoomableImages(root));
  if (images.length === 0) return;

  const module = await loadZoom();
  if (!module) {
    console.warn('[markdown-it] medium-zoom 加载失败');
    return;
  }
  ensureZoomCss();
  (module.default ?? module)(images);
}
