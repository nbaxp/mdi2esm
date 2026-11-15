import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildScriptModuleSource,
  buildSetupModuleSource,
  CONTAINER_LABELS,
  COPY_LABELS,
  createConfig,
  createMdocAdapters,
  createRenderEnv,
  DEFAULT_ADAPTERS,
  DEFAULT_CONFIG,
} from '../src/index.js';

const ADAPTER_KEYS = ['toHref', 'toSrc', 'anchorHref', 'toScriptImport', 'scriptContext', 'katexCss'];

test('配置：schema 与默认预设', () => {
  assert.deepEqual(Object.keys(DEFAULT_ADAPTERS).sort(), [...ADAPTER_KEYS].sort());
  assert.equal(DEFAULT_CONFIG.locale, 'zh');
  assert.deepEqual(DEFAULT_CONFIG.outline, [2, 3]);
  assert.deepEqual(DEFAULT_CONFIG.markdown, { lineNumbers: false, math: true, container: [] });
});

test('配置：createConfig 合并覆盖并按 locale 选文案', () => {
  assert.deepEqual(createConfig().labels.container, CONTAINER_LABELS.zh);
  assert.deepEqual(createConfig().labels.copy, COPY_LABELS.zh);
  assert.deepEqual(createConfig({ locale: 'en' }).labels.copy, COPY_LABELS.en);
  assert.deepEqual(createConfig({ markdown: { math: false } }).markdown, {
    lineNumbers: false,
    math: false,
    container: [],
  });
  const custom = createConfig({ adapters: { anchorHref: () => '#x' } });
  assert.equal(custom.adapters.anchorHref('a'), '#x');
  assert.equal(custom.adapters.toHref, DEFAULT_ADAPTERS.toHref);
});

test('渲染 env：暴露 adapters / labels / headings', () => {
  const env = createRenderEnv(createConfig(), { dir: 'guide/' });
  assert.equal(env.dir, 'guide/');
  assert.equal(env.adapters, env.config.adapters);
  assert.deepEqual(env.containerLabels, CONTAINER_LABELS.zh);
  assert.deepEqual(env.headings, []);
});

test('适配器：toHref / toSrc / anchorHref', () => {
  const { toHref, toSrc, anchorHref } = DEFAULT_ADAPTERS;
  assert.equal(toHref({ path: './foo.md', resolved: 'guide/foo.md', hash: '' }), '/guide/foo');
  assert.equal(toHref({ path: 'a.png', resolved: 'guide/a.png', hash: '#章节' }), '/guide/a.png#章节');
  assert.equal(toSrc({ src: 'a.png', resolved: 'guide/a.png' }), '/guide/a.png');
  assert.equal(toSrc({ src: '/img/a.png', resolved: '/img/a.png' }), '/img/a.png');
  assert.equal(anchorHref('章节-标题'), '#章节-标题');
});

test('脚本：相对导入按 config 适配器重写', () => {
  const source = buildScriptModuleSource(
    [{ attrs: '', content: "import { x } from './helper.js';\nexport default { mounted: x };" }],
    'guide/',
    createConfig(),
  );
  assert.match(source, /import \{ x \} from '\/guide\/helper\.js';/);
});

test('脚本：scriptContext 注入 frontmatter / params', () => {
  const source = buildSetupModuleSource(
    [{ attrs: ' setup', content: 'const t = frontmatter.title;' }],
    'guide/',
    { title: 'T' },
    {},
    createConfig(),
  );
  assert.match(source, /const frontmatter = \{"title":"T"\};/);
  assert.match(source, /const params = \{\};/);
  assert.match(source, /return \{ t: t \};/);
});

test('适配器：katexCss 默认不注入（esm 全局样式）', () => {
  assert.equal(DEFAULT_ADAPTERS.katexCss(), null);
  assert.equal(createConfig().adapters.katexCss(), null);
});

test('适配器：esm 与 mdoc 预设键一致', () => {
  assert.deepEqual(Object.keys(createMdocAdapters()).sort(), Object.keys(DEFAULT_ADAPTERS).sort());
});
