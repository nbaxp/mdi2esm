import assert from 'node:assert/strict';
import { test } from 'node:test';

import { md } from '../src/index.js';
import { renderMath } from '../src/math.js';

test('行内公式：输出行内占位标记', () => {
  const html = md.render('公式 $x^2$ 结束');
  assert.match(html, /class="md-math-placeholder"/);
  assert.match(html, /data-display="false"/);
  assert.match(html, /data-tex="x\^2"/);
});

test('块级公式：输出块级占位标记', () => {
  const html = md.render('$$\na+b\n$$');
  assert.match(html, /data-display="true"/);
  assert.match(html, /data-tex="a\+b"/);
});

test('段落内联的 $$...$$：按块级公式输出', () => {
  const html = md.render('前文 $$x^2$$ 后文');
  assert.match(html, /data-display="true"/);
  assert.match(html, /data-tex="x\^2"/);
});

test('转义美元符：不当作公式', () => {
  const html = md.render('价格 \\$5');
  assert.doesNotMatch(html, /md-math-placeholder/);
  assert.match(html, /\$5/);
});

test('行内代码：不解析公式', () => {
  const html = md.render('`$x$`');
  assert.doesNotMatch(html, /md-math-placeholder/);
});

test('代码围栏：不解析公式', () => {
  const html = md.render('```md\n$x$\n```');
  assert.doesNotMatch(html, /md-math-placeholder/);
});

test('未闭合块级公式：保留字面量，不吞后文', () => {
  const html = md.render('$$\nabc');
  assert.doesNotMatch(html, /md-math-placeholder/);
  assert.match(html, /\$\$/);
  assert.match(html, /abc/);
});

test('renderMath：只替换占位符，不改写其余模板（自闭合标签不被嵌套/小写化）', async () => {
  const source =
    '<Icon icon="a" />\n<Icon icon="b" />\n' +
    '<span class="md-math-placeholder" data-display="false" data-tex="x^2"></span>\n' +
    '<p>after</p>';
  const out = await renderMath(source);
  // 公式已渲染
  assert.match(out, /class="katex"/);
  assert.doesNotMatch(out, /md-math-placeholder/);
  // 非公式部分逐字保留：防止 innerHTML round-trip 吞掉后续内容的关键保证
  assert.ok(out.includes('<Icon icon="a" />\n<Icon icon="b" />\n'));
  assert.ok(out.includes('<p>after</p>'));
});
