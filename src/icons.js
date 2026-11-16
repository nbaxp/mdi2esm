// Iconify 图标：@iconify/vue 是可选 peer，只有页面真的渲染 <Icon> 时才动态加载；
// 包内不内置任何图标集，未注册的图标由 Iconify 默认 API（api.iconify.design）联网获取。
// 宿主可在调用时用 registerIconCollection / registerIcon 扩充本地图标集，离线也能渲染。
import { defineAsyncComponent } from 'vue';

const loadIconify = () => import('@iconify/vue');

export const Icon = defineAsyncComponent(() => loadIconify().then((mod) => mod.Icon));

/**
 * 注册一个图标集（@iconify-json/* 的 icons 导出，或同结构的对象）。
 * 注册后该集合的图标不再请求网络。
 */
export async function registerIconCollection(collection) {
  const { addCollection } = await loadIconify();
  addCollection(collection);
  return collection;
}

/**
 * 注册单个图标。
 * @param {string} name 完整名称，如 `demo:spark`
 * @param {{ body: string, width?: number, height?: number }} data 图标数据
 */
export async function registerIcon(name, data) {
  const { addIcon } = await loadIconify();
  addIcon(name, data);
  return name;
}
