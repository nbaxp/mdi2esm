import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createConfig, createPathAdapters, createPathResolver, DEFAULT_PATHS, joinPath } from '../src/index.js';

// PATH-REDESIGN-v8.md §8 的基准配置
const BASE = {
  i18nEnabled: true,
  routerBase: '/app/',
  docsRouterPath: '/help',
  docStaticPath: '/content',
  defaultLang: 'zh-CN',
  langs: ['zh-CN', 'en-US'],
};

test('§1 DEFAULT_PATHS：十项默认值与空配置下的基准解析', () => {
  assert.deepEqual(DEFAULT_PATHS, {
    i18nEnabled: false,
    omitDefaultLang: true,
    urlTransformEnabled: true,
    routerBase: '/',
    docsRouterPath: '/docs',
    docStaticPath: '/content',
    defaultLang: 'zh-CN',
    langs: [],
    lang: null,
    routeFullPath: '/',
  });
  const r = createPathResolver();
  assert.deepEqual(
    { lang: r.context.lang, routeLang: r.context.routeLang, docPath: r.context.docPath },
    { lang: 'zh-CN', routeLang: '', docPath: '/' },
  );
  assert.equal(r.sourceUrl(), '/content/zh-CN/index.md');
  assert.equal(r.resolve('./a.md'), '/docs/a');
});

test('join：去重复斜杠、规范 . ..、根 / 为空段、保留目录尾斜杠', () => {
  assert.equal(joinPath('/app/', '/content', 'zh-CN', 'guide/index.md'), '/app/content/zh-CN/guide/index.md');
  assert.equal(joinPath('/help', '', 'guide/intro'), '/help/guide/intro');
  assert.equal(joinPath('/help', '', '/'), '/help');
  assert.equal(joinPath('/help', '', 'guide/'), '/help/guide/');
  assert.equal(joinPath('/', '/content', 'a/../b.md'), '/content/b.md');
});

test('§7 默认语言：四条公式全部命中', () => {
  const r = createPathResolver({ ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  assert.deepEqual(
    {
      lang: r.context.lang,
      routeLang: r.context.routeLang,
      docPath: r.context.docPath,
      docDir: r.context.docDir,
      docFilePath: r.context.docFilePath,
    },
    { lang: 'zh-CN', routeLang: '', docPath: '/guide/', docDir: '/guide/', docFilePath: '/guide/index' },
  );
  assert.equal(r.sourceUrl(), '/app/content/zh-CN/guide/index.md');
  assert.equal(r.resolve('./intro.md'), '/help/guide/intro');
  assert.equal(r.resolve('/api/auth.md'), '/help/api/auth');
  assert.equal(r.resolve('./img/a.png'), '/app/content/guide/img/a.png');
  assert.equal(r.resolve('/img/logo.png'), '/app/img/logo.png');
});

test('§7 非默认语言：路由带 lang，资源不带 lang、两列一致', () => {
  const r = createPathResolver({ ...BASE, lang: 'en-US', routeFullPath: '/help/en-US/guide/' });
  assert.equal(r.context.lang, 'en-US');
  assert.equal(r.context.routeLang, 'en-US');
  assert.equal(r.context.docPath, '/guide/');
  assert.equal(r.sourceUrl(), '/app/content/en-US/guide/index.md');
  assert.equal(r.resolve('./intro.md'), '/help/en-US/guide/intro');
  assert.equal(r.resolve('/api/auth.md'), '/help/en-US/api/auth');
  assert.equal(r.resolve('./img/a.png'), '/app/content/guide/img/a.png');
  assert.equal(r.resolve('/img/logo.png'), '/app/img/logo.png');
});

test('§3 目录首页：docFilePath 补 index，index.md 归一为带尾斜杠的目录链接', () => {
  const r = createPathResolver({ ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  assert.equal(r.sourceUrl(), '/app/content/zh-CN/guide/index.md');
  assert.equal(r.resolve('index.md'), '/help/guide/');
  assert.equal(r.resolve('/index.md'), '/help/');
  // 裸目录路径（无 .md）按 §5 归为文档资源，不是文档链接
  assert.equal(r.resolve('./'), '/app/content/guide/');
});

test('omitDefaultLang=false：默认语言也带路由段', () => {
  const cfg = { ...BASE, omitDefaultLang: false, lang: 'zh-CN', routeFullPath: '/help/zh-CN/guide/' };
  const r = createPathResolver(cfg);
  assert.equal(r.context.routeLang, 'zh-CN');
  assert.equal(r.context.docPath, '/guide/');
  assert.equal(r.resolve('./intro.md'), '/help/zh-CN/guide/intro');
  assert.equal(r.resolve('/api/auth.md'), '/help/zh-CN/api/auth');
  assert.equal(r.sourceUrl(), '/app/content/zh-CN/guide/index.md');
});

test('§4 语言段识别：从 routeFullPath 推导 lang（宿主未显式传 lang）', () => {
  const nonDefault = createPathResolver({ ...BASE, routeFullPath: '/help/en-US/guide/' });
  assert.equal(nonDefault.context.lang, 'en-US');
  assert.equal(nonDefault.context.docPath, '/guide/');
  const fallback = createPathResolver({ ...BASE, routeFullPath: '/help/guide/' });
  assert.equal(fallback.context.lang, 'zh-CN');
  assert.equal(fallback.context.docPath, '/guide/');
});

test('§4 docsRouterPath=/ 边界：不剥离，语言段仍从第一段识别', () => {
  const root = { ...BASE, docsRouterPath: '/' };
  assert.equal(createPathResolver({ ...root, routeFullPath: '/guide/' }).context.docPath, '/guide/');
  const en = createPathResolver({ ...root, routeFullPath: '/en-US/guide/' });
  assert.equal(en.context.lang, 'en-US');
  assert.equal(en.context.docPath, '/guide/');
  const nested = createPathResolver({ ...BASE, routeFullPath: '/help/en-US/guide/' });
  assert.equal(nested.context.lang, 'en-US');
  assert.equal(nested.context.docPath, '/guide/');
});

test('§5 分类优先级：.md 结尾（相对与根绝对）一律文档链接', () => {
  const r = createPathResolver({ ...BASE, lang: 'en-US', routeFullPath: '/help/en-US/guide/' });
  assert.equal(r.resolve('./intro.md'), '/help/en-US/guide/intro');
  assert.equal(r.resolve('/api/auth.md'), '/help/en-US/api/auth');
  assert.equal(r.resolve('intro.md'), '/help/en-US/guide/intro');
});

test('§5 相对/绝对资源分流 + query/hash 原样保留，不解码 %2F', () => {
  const r = createPathResolver({ ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  assert.equal(r.resolve('./a.png?v=1#x'), '/app/content/guide/a.png?v=1#x');
  assert.equal(r.resolve('/img/a.png?q=%2F#y'), '/app/img/a.png?q=%2F#y');
});

test('§5 文档链接的 query / hash 原样保留（含 index 归一）', () => {
  const r = createPathResolver({ ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  assert.equal(r.resolve('./intro.md?v=1#sec'), '/help/guide/intro?v=1#sec');
  assert.equal(r.resolve('/api/auth.md?q=%2F#top'), '/help/api/auth?q=%2F#top');
  assert.equal(r.resolve('/index.md?from=nav#top'), '/help/?from=nav#top');
});

test('§5 外链 / 协议相对 / mailto / tel / data / 纯片段原样', () => {
  const r = createPathResolver({ ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  for (const raw of [
    'https://x.com/a.png',
    '//cdn/x.js',
    'mailto:a@b.com',
    'tel:123',
    'data:image/png;base64,AAA',
    '#anchor',
  ]) {
    assert.equal(r.resolve(raw), raw);
  }
});

test('§5 urlTransformEnabled=false 时全部原样', () => {
  const r = createPathResolver({ ...BASE, urlTransformEnabled: false, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  assert.equal(r.resolve('./intro.md'), './intro.md');
  assert.equal(r.resolve('./a.png'), './a.png');
});

test('§4 路径歧义：语言标识与文档首段重名时语言段优先', () => {
  const cfg = { ...BASE, omitDefaultLang: false, langs: ['zh-CN', 'en-US', 'guide'], routeFullPath: '/help/guide/' };
  const r = createPathResolver(cfg);
  assert.equal(r.context.lang, 'guide');
  assert.equal(r.context.docPath, '/');
});

test('resolveResource：库内静态资源走 docStaticPath，外链原样', () => {
  const r = createPathResolver({ ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  assert.equal(r.resolveResource({ file: 'snippets/demo.ts' }), '/app/content/snippets/demo.ts');
  assert.equal(r.resolveResource({ file: '', spec: 'https://x.com/a.json' }), 'https://x.com/a.json');
});

test('toScriptImport：相对/绝对加 routerBase，裸包名原样', () => {
  const r = createPathResolver({ ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  assert.equal(r.toScriptImport({ spec: './h.js', resolved: 'guide/h.js' }), '/app/guide/h.js');
  assert.equal(r.toScriptImport({ spec: '/abs.js', resolved: '' }), '/app/abs.js');
  assert.equal(r.toScriptImport({ spec: 'vue', resolved: '' }), 'vue');
});

test('createConfig({ paths })：走 v8 适配器，且与 base 模式隔离', () => {
  const cfg = createConfig({ paths: { ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' } });
  assert.equal('paths' in cfg && cfg.paths !== null, true);
  assert.equal(cfg.adapters.toHref({ path: './intro.md', hash: '' }), '/help/guide/intro');
  assert.equal(cfg.adapters.toSrc({ src: './img/a.png' }), '/app/content/guide/img/a.png');
  // base 模式不受影响
  const baseCfg = createConfig({ base: '/doc/' });
  assert.equal(baseCfg.paths, null);
  assert.equal(baseCfg.adapters.toHref({ path: './a.md', resolved: 'guide/a.md', hash: '' }), '/doc/guide/a');
});

test('createPathAdapters：hash 拼回、外链经 resolve 原样', () => {
  const a = createPathAdapters({ ...BASE, lang: 'zh-CN', routeFullPath: '/help/guide/' });
  assert.equal(a.toHref({ path: './intro.md', hash: '#sec' }), '/help/guide/intro#sec');
  assert.equal(a.toSrc({ src: 'https://x.com/a.png' }), 'https://x.com/a.png');
});
