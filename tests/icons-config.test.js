import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createConfig, createMarkdownComponent, Icon } from '../src/index.js';

const build = (config) => createMarkdownComponent('# 标题', '', config);

test('默认注册内置异步 Icon', async () => {
  const { component } = await build(createConfig());
  assert.equal(component.components.Icon, Icon);
});

test('icons: false 不注册，交给宿主全局 Icon', async () => {
  const { component } = await build(createConfig({ icons: false }));
  assert.equal(component.components.Icon, undefined);
});

test('icons 传组件时直接使用该组件', async () => {
  const CustomIcon = { name: 'CustomIcon', render: () => null };
  const { component } = await build(createConfig({ icons: CustomIcon }));
  assert.equal(component.components.Icon, CustomIcon);
});
