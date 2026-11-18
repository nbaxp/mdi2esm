import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createConfig, renderMarkdown } from '../src/index.js';
import { RENDER_CASES } from './fixtures/render-cases.js';

const fence = '```';

for (const { name, source, check } of RENDER_CASES) {
  test(`渲染：${name}`, async () => {
    const { html } = await renderMarkdown(source, { dir: 'guide/' });
    assert.ok(check(html), `输出不符合预期：${html.slice(0, 300)}`);
  });
}

test('配置：locale=en 切换容器与复制按钮文案', async () => {
  const config = createConfig({ locale: 'en' });
  assert.match((await renderMarkdown('::: tip\n内容\n:::', { dir: 'guide/', config })).html, /TIP/);
  assert.match(
    (await renderMarkdown(`${fence}js\nlet a=1\n${fence}`, { dir: 'guide/', config })).html,
    /title="Copy code"/,
  );
});

test('配置：markdown.lineNumbers 开启全局行号', async () => {
  const config = createConfig({ markdown: { lineNumbers: true } });
  assert.match((await renderMarkdown(`${fence}js\nlet a=1\n${fence}`, { config })).html, /line-numbers-wrapper/);
});

test('配置：markdown.math=false 关闭公式占位', async () => {
  const config = createConfig({ markdown: { math: false } });
  assert.doesNotMatch((await renderMarkdown('公式 $x^2$', { config })).html, /md-math-placeholder/);
});

test('配置：markdown.container 注册自定义容器', async () => {
  const config = createConfig({ markdown: { container: [{ type: 'demo', title: '演示' }] } });
  const { html } = await renderMarkdown('::: demo\n内容\n:::', { config });
  assert.match(html, /<div class="demo custom-block">/);
  assert.match(html, /演示/);
  assert.match((await renderMarkdown('::: demo\n再次\n:::', { config })).html, /<div class="demo custom-block">/);
});

test('配置：自定义容器与内置容器冲突时报错', async () => {
  const config = createConfig({ markdown: { container: [{ type: 'tip' }] } });
  await assert.rejects(() => renderMarkdown('正文', { config }), /与内置容器冲突/);
});
