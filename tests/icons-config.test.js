import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createConfig, createMarkdownComponent, DEFAULT_CONFIG, Icon } from '../src/index.js';

const build = (config) => createMarkdownComponent('# 标题', '', config);

test('默认配置不注册 Icon，交给宿主全局组件', async () => {
  assert.equal(DEFAULT_CONFIG.icons, false);

  const { component } = await build(createConfig());
  assert.equal(component.components.Icon, undefined);
  assert.ok(component.components.ClientOnly);
});

test('icons: true 时注册包内异步 Icon', async () => {
  const { component } = await build(createConfig({ icons: true }));
  assert.equal(component.components.Icon, Icon);
});

test('icons 传组件时直接使用该组件', async () => {
  const CustomIcon = { name: 'CustomIcon', render: () => null };
  const { component } = await build(createConfig({ icons: CustomIcon }));
  assert.equal(component.components.Icon, CustomIcon);
});
