import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSetupModuleSource } from '../src/index.js';

test('buildSetupModuleSource 注入 frontmatter/params 到 setup 作用域', () => {
  const src = buildSetupModuleSource(
    [{ attrs: ' setup', content: 'const t = frontmatter.title;' }],
    'guide/',
    { title: 'T' },
    {},
  );
  assert.ok(src !== null);
  assert.match(src, /const frontmatter = \{"title":"T"\};/);
  assert.match(src, /const params = \{\};/);
  assert.match(src, /export function setup\(\) \{[\s\S]*const t = frontmatter\.title;/);
  assert.match(src, /return \{ t: t \};/);
});

test('无 <script setup> 返回 null', () => {
  assert.equal(buildSetupModuleSource([{ attrs: '', content: 'x' }], 'guide/', {}, {}), null);
});

test('frontmatter/params 缺失时注入空对象', () => {
  const src = buildSetupModuleSource([{ attrs: ' setup', content: '' }], 'guide/', undefined, undefined);
  assert.match(src, /const frontmatter = \{\};/);
  assert.match(src, /const params = \{\};/);
});
