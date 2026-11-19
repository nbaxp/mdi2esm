import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertConfigCompatible, createConfig, createMarkdownComponent } from '../src/index.js';
import { extractTopLevelBlocks } from '../src/pipeline.js';

const SOURCE = `---
title: T
---

# 标题

<script setup>
const greeting = 'hi';
</script>

正文 {{ greeting }}。
`;

test('配置：单例冲突告警（仅首份配置生效）', () => {
  const original = console.warn;
  let warnings = 0;
  console.warn = () => {
    warnings += 1;
  };
  try {
    assertConfigCompatible(createConfig({ locale: 'zh' }));
    assertConfigCompatible(createConfig({ locale: 'en' }));
  } finally {
    console.warn = original;
  }
  assert.equal(warnings, 1);
});

test('块提取：scripts=false 时不剥离 <script>（留正文，不执行）', () => {
  const kept = extractTopLevelBlocks('<script setup>\nconst a = 1;\n</script>\n\n正文', {
    extractScripts: false,
  });
  assert.equal(kept.scripts.length, 0);
  assert.match(kept.body, /<script setup>/);

  const taken = extractTopLevelBlocks('<script setup>\nconst a = 1;\n</script>\n\n正文');
  assert.equal(taken.scripts.length, 1);
  assert.doesNotMatch(taken.body, /<script setup>/);
});

test('组件：markdown.scripts=false 时不装配 setup', async () => {
  const config = createConfig({ markdown: { scripts: false } });
  const { component } = await createMarkdownComponent(SOURCE, '', config);
  assert.equal(component.setup, undefined);
});
