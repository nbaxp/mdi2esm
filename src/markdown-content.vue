<!--
  客户端入口：一个标签搞定，文本由调用方自己取（fetch / import / textarea / 接口都不归库管）。

    <MarkdownContent :source="md" :config="config" :components="{ Icon, Badge }" @headings="onHeadings" />

  内部完成 md → 组件 → 注入宿主组件这一串，调用方不需要碰 createMarkdownComponent。
  组件本身走 SFC 编译，产物里没有模板字符串，只保留 md 转出来的那份模板需要运行时 compile。
-->
<script setup>
import { markRaw, shallowRef, watch } from 'vue';

import { createConfig } from './config.js';
import { createMarkdownComponent } from './pipeline.js';

defineOptions({
  name: 'MarkdownContent',
  // app.use(MarkdownContent) 之后即可在任意模板里写 <MarkdownContent>
  install(app) {
    app.component('MarkdownContent', this);
  },
});

const props = defineProps({
  // markdown 文本
  source: { type: String, default: '' },
  // 相对链接、相对 import 的基准目录
  dir: { type: String, default: '' },
  // 不传则用默认配置
  config: { type: Object, default: null },
  // md 里出现的组件（<Icon> / <Badge> 等）；只在编译时读取
  components: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['headings']);

const Content = shallowRef(null);
const headings = shallowRef([]);
// source 连续变化时只认最后一次，丢弃过期结果
let token = 0;

async function compile() {
  const current = ++token;
  const { component, headings: next } = await createMarkdownComponent(
    props.source,
    props.dir,
    props.config ?? createConfig(),
  );
  if (current !== token) return;

  if (!component) {
    Content.value = null;
    headings.value = [];
    emit('headings', []);
    return;
  }

  // 注入只作用于这份 md 编出的组件，不污染全局
  component.components = { ...(component.components || {}), ...props.components };
  Content.value = markRaw(component);
  headings.value = next;
  emit('headings', next);
}

watch(() => [props.source, props.dir, props.config], compile, { immediate: true });

defineExpose({ headings });
</script>

<template>
  <component :is="Content" v-if="Content" />
</template>
