import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Icon, registerIcon, registerIconCollection } from '../src/index.js';

test('Icon 是异步组件，@iconify/vue 只在渲染时加载', () => {
  assert.equal(typeof Icon, 'object');
  assert.equal(Icon.name, 'AsyncComponentWrapper');
  assert.equal(typeof Icon.__asyncLoader, 'function');
});

test('registerIconCollection 注册的图标可离线解析', async () => {
  await registerIconCollection({
    prefix: 'mditest',
    icons: {
      spark: { body: '<path d="M0 0h24v24H0z"/>', width: 24, height: 24 },
    },
  });
  const { getIcon } = await import('@iconify/vue');
  assert.ok(getIcon('mditest:spark'));
});

test('registerIcon 注册单个图标', async () => {
  await registerIcon('mditest:single', { body: '<path d="M0 0h8v8H0z"/>', width: 8, height: 8 });
  const { getIcon } = await import('@iconify/vue');
  assert.ok(getIcon('mditest:single'));
});
