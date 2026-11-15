// medium-zoom 图片点击放大（移植自 mdoc）：仅当正文有可放大图片时动态加载
// 外链包裹图与 mermaid 输出不参与；遮罩背景跟随主题 CSS 变量
const ZOOM_CSS = `.medium-zoom-overlay { background: var(--vp-c-bg) !important; z-index: 100; }
.medium-zoom-image--opened { z-index: 101; }`;
let zoomModule;

function ensureZoomCss() {
  if (document.head.querySelector('style[data-md-medium-zoom]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-md-medium-zoom', '');
  style.textContent = ZOOM_CSS;
  document.head.append(style);
}

function zoomableImages() {
  return Array.from(document.querySelectorAll('.vp-doc img')).filter(
    (img) => !img.closest('a') && !img.closest('.mermaid-rendered'),
  );
}

export async function mountImageZoom() {
  const images = zoomableImages();
  if (images.length === 0) return;

  zoomModule ??= import('medium-zoom').catch(() => null);
  const module = await zoomModule;
  if (!module) {
    console.warn('[markdown-it] medium-zoom 加载失败');
    return;
  }
  ensureZoomCss();
  (module.default ?? module)(images);
}
