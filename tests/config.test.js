import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTAINER_LABELS,
  COPY_LABELS,
  createBaseAdapters,
  createConfig,
  createRenderEnv,
  DEFAULT_ADAPTERS,
  DEFAULT_CONFIG,
} from '../src/config.js';
import { buildScriptModuleSource, buildSetupModuleSource } from '../src/markdown-script.js';

const ADAPTER_KEYS = ['toHref', 'toSrc', 'toScriptImport', 'scriptContext'];

test('配置：schema 与默认预设', () => {
  assert.deepEqual(Object.keys(DEFAULT_ADAPTERS).sort(), [...ADAPTER_KEYS].sort());
  assert.equal(DEFAULT_CONFIG.locale, 'zh');
  assert.equal(DEFAULT_CONFIG.mermaidDriver, 'pele');
  assert.equal(createConfig({ mermaidDriver: 'mermaid' }).mermaidDriver, 'mermaid');
  assert.deepEqual(DEFAULT_CONFIG.markdown, {
    lineNumbers: false,
    math: true,
    mark: true,
    sub: true,
    sup: true,
    container: [],
    scripts: true,
    frontmatterParser: null,
    toc: { level: [2, 3], showAutoNumber: false, allowMultiToc: true },
  });
});

test('配置：createConfig 合并覆盖并按 locale 选文案', () => {
  assert.deepEqual(createConfig().labels.container, CONTAINER_LABELS.zh);
  assert.deepEqual(createConfig().labels.copy, COPY_LABELS.zh);
  assert.deepEqual(createConfig({ locale: 'en' }).labels.copy, COPY_LABELS.en);
  assert.deepEqual(createConfig({ markdown: { math: false } }).markdown, {
    lineNumbers: false,
    math: false,
    mark: true,
    sub: true,
    sup: true,
    container: [],
    scripts: true,
    frontmatterParser: null,
    toc: { level: [2, 3], showAutoNumber: false, allowMultiToc: true },
  });
  const custom = createConfig({ adapters: { toSrc: ({ src }) => `/x/${src}` } });
  assert.equal(custom.adapters.toSrc({ src: 'a.png', resolved: 'guide/a.png' }), '/x/a.png');
  // 只覆写声明的那个，其余仍走 base 生成的默认实现
  assert.equal(custom.adapters.toHref({ path: 'a.md', resolved: 'a.md', hash: '' }), '/a');
});

test('渲染 env：暴露 adapters / labels / headings', () => {
  const env = createRenderEnv(createConfig(), { dir: 'guide/' });
  assert.equal(env.dir, 'guide/');
  assert.equal(env.adapters, env.config.adapters);
  assert.deepEqual(env.containerLabels, CONTAINER_LABELS.zh);
  assert.deepEqual(env.headings, []);
});

test('适配器：toHref / toSrc', () => {
  const { toHref, toSrc } = DEFAULT_ADAPTERS;
  assert.equal(toHref({ path: './foo.md', resolved: 'guide/foo.md', hash: '' }), '/guide/foo');
  assert.equal(toHref({ path: 'a.png', resolved: 'guide/a.png', hash: '#章节' }), '/guide/a.png#章节');
  assert.equal(toSrc({ src: 'a.png', resolved: 'guide/a.png' }), '/guide/a.png');
  assert.equal(toSrc({ src: '/img/a.png', resolved: '/img/a.png' }), '/img/a.png');
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

test('适配器：base 编进 adapters，配置上不出现 base 字段', () => {
  const config = createConfig({ base: '/doc/' });
  assert.equal('base' in config, false);
  assert.equal(config.adapters.toHref({ path: './a.md', resolved: 'guide/a.md', hash: '#x' }), '/doc/guide/a#x');
  // 根部署与默认适配器完全等价
  assert.deepEqual(Object.keys(createBaseAdapters('/')), Object.keys(DEFAULT_ADAPTERS));
  assert.equal(createConfig().adapters.toHref({ path: './a.md', resolved: 'guide/a.md', hash: '' }), '/guide/a');
});

test('适配器：子路径下相对/绝对路径都带上 base', () => {
  const { toSrc, toScriptImport } = createBaseAdapters('/doc');
  assert.equal(toSrc({ src: 'a.png', resolved: 'guide/a.png' }), '/doc/guide/a.png');
  assert.equal(toSrc({ src: '/img/a.png', resolved: '/img/a.png' }), '/doc/img/a.png');
  assert.equal(toScriptImport({ spec: './h.js', resolved: 'guide/h.js' }), '/doc/guide/h.js');
  assert.equal(toScriptImport({ spec: '/abs.js', resolved: '' }), '/doc/abs.js');
  assert.equal(toScriptImport({ spec: 'vue', resolved: '' }), 'vue');
});
