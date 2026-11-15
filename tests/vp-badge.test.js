import assert from 'node:assert/strict';
import { test } from 'node:test';

import { badgeStyles, extractTopLevelBlocks, VPBadge } from '../src/index.js';

test('badgeStyles 从包入口导出，含徽标各类型的样式规则', () => {
  assert.equal(typeof badgeStyles, 'string');
  assert.match(badgeStyles, /\.VPBadge\s*\{/);
  for (const type of ['info', 'tip', 'warning', 'danger']) {
    assert.match(badgeStyles, new RegExp(`\\.VPBadge\\.${type}\\s*\\{`));
  }
});

test('VPBadge 组件不携带样式注入（无 mixins / styles）', () => {
  assert.equal(VPBadge.mixins, undefined);
  assert.equal(VPBadge.styles, undefined);
  assert.equal(typeof VPBadge.template, 'string');
});

test('extractTopLevelBlocks 仍剥离 <style> 块并保留内容', () => {
  const { body, styles } = extractTopLevelBlocks('# 标题\n\n<style>\n.foo { color: red; }\n</style>\n\n正文');
  assert.equal(styles.length, 1);
  assert.match(styles[0].content, /\.foo \{ color: red; \}/);
  assert.doesNotMatch(body, /<style>/);
  assert.match(body, /# 标题/);
  assert.match(body, /正文/);
});
