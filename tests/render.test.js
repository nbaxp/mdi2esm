import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildOutline, createConfig, createMarkdownComponent, renderMarkdown } from '../src/index.js';
import { escapeInvalidInterpolations, resolvePath } from '../src/render.js';
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

test('resolvePath：处理 ./ 与 ../', () => {
  assert.equal(resolvePath('guide/', './a.md'), 'guide/a.md');
  assert.equal(resolvePath('guide/parts/', '../a.md'), 'guide/a.md');
  assert.equal(resolvePath('', 'a/b/../c.md'), 'a/c.md');
});

test('escapeInvalidInterpolations：合法插值保留，非法插值转义为实体', () => {
  assert.equal(escapeInvalidInterpolations('文本 {{ $frontmatter.title }} 尾'), '文本 {{ $frontmatter.title }} 尾');
  assert.equal(escapeInvalidInterpolations('{{ $frontmatter.a.b }}'), '{{ $frontmatter.a.b }}');
  assert.equal(
    escapeInvalidInterpolations('{{ $frontmatter..title }}'),
    '&#123;&#123; $frontmatter..title &#125;&#125;',
  );
});

test('renderMarkdown 收集 h2-h6 标题（h1 页面标题不进目录）', async () => {
  const { headings: collected } = await renderMarkdown('# H1\n## H2\n### H3\n#### H4\n##### H5');
  assert.deepEqual(
    collected.map((h) => h.level),
    [2, 3, 4, 5],
  );
});

test('buildOutline：按 level 生成层级树', async () => {
  const { headings } = await renderMarkdown('## A\n### B\n## C');
  const tree = buildOutline(headings);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].title, 'A');
  assert.equal(tree[0].children[0].title, 'B');
  assert.equal(tree[1].title, 'C');
});

test('headings 带源码行号 line（1-based）', async () => {
  const { headings } = await renderMarkdown('## 一\n\n正文\n\n## 二');
  assert.deepEqual(
    headings.map((h) => h.line),
    [1, 5],
  );
});

test('headings.line 含 frontmatter/script 剥离偏移', async () => {
  const src = '---\ntitle: T\n---\n\n<script setup>\nconst a = 1\n</script>\n\n## 标题';
  const { headings } = await createMarkdownComponent(src, '', createConfig(), { frontmatter: {} });
  assert.equal(headings[0].line, 9);
});

test('http(s) 外链加 target/rel，但不注入图标 DOM（对齐 VitePress 默认）', async () => {
  const { html } = await renderMarkdown('[VitePress](https://vitepress.dev) 文本');
  assert.match(html, /<a href="https:\/\/vitepress\.dev" target="_blank" rel="noreferrer">VitePress<\/a>/);
  assert.equal(html.includes('vp-external-link-icon'), false);
  assert.equal(html.includes('<svg'), false);
});

test('mailto/tel 外链只加 target，不加图标', async () => {
  const { html } = await renderMarkdown('[邮件](mailto:a@b.com) [电话](tel:123)');
  assert.match(html, /target="_blank"/);
  assert.equal(html.includes('vp-external-link-icon'), false);
});

test('内部链接不加 target 与图标', async () => {
  const { html } = await renderMarkdown('[内部](/guide/index.md)');
  assert.equal(html.includes('target="_blank"'), false);
  assert.equal(html.includes('vp-external-link-icon'), false);
});

test('根绝对路径也经 toHref，由宿主适配器决定 base 与路由', async () => {
  const config = createConfig({
    base: '/docs/',
    adapters: {
      toHref: ({ resolved, hash }) => `/docs/route/${resolved.replace(/\.md$/, '')}${hash}`,
    },
  });
  const { html } = await renderMarkdown('[根绝对](/guide/index.md)', { config });
  assert.match(html, /href="\/docs\/route\/guide\/index"/);
});

test('协议相对链接原样输出，不经 toHref', async () => {
  const config = createConfig({ adapters: { toHref: () => '/SHOULD-NOT-APPEAR' } });
  const { html } = await renderMarkdown('[协议相对](//x.com/a)', { config });
  assert.match(html, /href="\/\/x\.com\/a"/);
  assert.equal(html.includes('SHOULD-NOT-APPEAR'), false);
});

test('image =WxH 解析为 width/height 并剥离尺寸后缀', async () => {
  const { html } = await renderMarkdown('![a](img.png =200x300)');
  assert.match(html, /<img src="[^"]*img\.png"[^>]*width="200" height="300"/);
});

test('图片懒加载默认关闭（对齐 VitePress），不附加 loading', async () => {
  const { html } = await renderMarkdown('![a](img.png)');
  assert.ok(!/loading="lazy"/.test(html));
});

test('markdown.image.lazyLoad=true 时相对路径图片加 loading=lazy', async () => {
  const config = createConfig({ markdown: { image: { lazyLoad: true } } });
  const { html } = await renderMarkdown('![a](img.png)', { config });
  assert.match(html, /<img[^>]*loading="lazy"/);
});

test('lazyLoad=true 时外链/data 图片仍不加 loading', async () => {
  const config = createConfig({ markdown: { image: { lazyLoad: true } } });
  const { html } = await renderMarkdown('![a](https://x.com/a.png)\n\n![b](data:image/png;base64,AAA)', { config });
  assert.ok(!/loading="lazy"/.test(html));
});

test('image =Wx 仅设置 width', async () => {
  const { html } = await renderMarkdown('![a](img.png =200x)');
  assert.match(html, /width="200"/);
  assert.ok(!/height="\d+"/.test(html));
});

test('image =xH 仅设置 height', async () => {
  const { html } = await renderMarkdown('![a](img.png =x300)');
  assert.match(html, /height="300"/);
  assert.ok(!/width="\d+"/.test(html));
});

test('外链 image =WxH 同样设置尺寸且不改 src（外链不附加 loading）', async () => {
  const { html } = await renderMarkdown('![a](https://x.com/a.png =100x50)');
  assert.match(html, /<img src="https:\/\/x\.com\/a\.png"[^>]*width="100" height="50"/);
  assert.ok(!/loading="lazy"/.test(html));
});

test('无尺寸语法的图片不含 width/height', async () => {
  const { html } = await renderMarkdown('![a](img.png)');
  assert.ok(!/width=/.test(html));
  assert.ok(!/height=/.test(html));
});

test('渲染期的 rebase：marker 不输出，被包含文件的相对链接按其目录解析', async () => {
  const src =
    '<!-- @include-start: guide/parts/ -->\n\n[链接](./next.md)\n\n<!-- @include-end -->\n\n[页面链接](./other.md)';
  const { html } = await renderMarkdown(src);
  assert.equal(html.includes('@include-start'), false);
  assert.equal(html.includes('@include-end'), false);
  assert.match(html, /href="\/guide\/parts\/next"/);
  assert.match(html, /href="\/other"/);
});
