import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stripFrontmatter } from '../src/index.js';

test('标准 frontmatter：顶部 --- 包裹 YAML', () => {
  assert.equal(stripFrontmatter('---\ntitle: 你好\n---\n# 正文'), '# 正文');
});

test('BOM 开头：去掉 BOM 后仍可剥离', () => {
  assert.equal(stripFrontmatter('\uFEFF---\ntitle: T\n---\n# 正文'), '# 正文');
});

test('CRLF：剥离后保留原有 CRLF 行尾', () => {
  assert.equal(stripFrontmatter('---\r\ntitle: T\r\n---\r\n# 正文\r\n'), '# 正文\r\n');
});

test('结束行为 ...（YAML 文档结束符）', () => {
  assert.equal(stripFrontmatter('---\ntitle: T\n...\n# 正文'), '# 正文');
});

test('开头有空行：不剥离', () => {
  const source = '\n---\ntitle: T\n---\n# 正文';
  assert.equal(stripFrontmatter(source), source);
});

test('开头有空格：不剥离', () => {
  const source = '  ---\ntitle: T\n---\n# 正文';
  assert.equal(stripFrontmatter(source), source);
});

test('正文中间的 --- 不参与', () => {
  const source = '# 正文\n\n---\n\n段落';
  assert.equal(stripFrontmatter(source), source);
});

test('找不到结束行：不剥离，整段按正文处理', () => {
  const source = '---\ntitle: T\n# 正文';
  assert.equal(stripFrontmatter(source), source);
});

test('空 frontmatter：--- 紧跟 ---', () => {
  assert.equal(stripFrontmatter('---\n---\n# 正文'), '# 正文');
});

test('定界符行尾空白不阻碍剥离', () => {
  assert.equal(stripFrontmatter('---   \ntitle: T\n---  \n# 正文'), '# 正文');
});
