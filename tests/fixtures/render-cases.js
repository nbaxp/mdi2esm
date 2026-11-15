// 共享渲染断言：只描述输入与期望，不 import 任何运行时实现。
// 阶段 2 抽包后本文件可直接迁入 markdown-rt/tests/fixtures/，由 esm / mdoc 各自的薄壳调用。
const fence = '```';
const hashLink = `[跳](#${encodeURIComponent('章节 标题')})`;

export const RENDER_CASES = [
  { name: 'footnote', source: '正文[^1]\n\n[^1]: 脚注内容', check: (h) => /footnote-ref/.test(h) },
  { name: 'tasklist', source: '- [x] 完成\n- [ ] 待办', check: (h) => /type="checkbox"/.test(h) },
  {
    name: 'details-open',
    source: '::: details 标题 {open}\n内容\n:::',
    check: (h) => /<details[^>]*open="open"/.test(h),
  },
  {
    name: 'no-title',
    source: '::: tip 提示 {no-title}\n内容\n:::',
    check: (h) => /custom-block/.test(h) && !/custom-block-title/.test(h) && !/no-title=/.test(h),
  },
  {
    name: 'copy-labels',
    source: `${fence}js\nlet a = 1\n${fence}`,
    check: (h) => /title="复制代码"[^>]*data-copied="已复制"/.test(h),
  },
  { name: 'anchor', source: '## 章节标题', check: (h) => /aria-label="Permalink to “章节标题”"/.test(h) },
  {
    name: 'external-attrs',
    source: '[外链](https://example.com)',
    check: (h) => /target="_blank"/.test(h) && /rel="noreferrer"/.test(h),
  },
  { name: 'external-icon', source: '[外链](https://example.com)', check: (h) => /vp-external-link-icon/.test(h) },
  {
    name: 'image-size',
    source: '![图](pic.png =100x200)',
    check: (h) => /width="100"[^>]*height="200"/.test(h),
  },
  { name: 'image-lazy', source: '![图](pic.png)', check: (h) => /loading="lazy"/.test(h) },
  { name: 'hash-slug', source: hashLink, check: (h) => /href="#章节-标题"/.test(h) },
  { name: 'empty-anchor', source: '[跳](#)', check: (h) => /href="#"/.test(h) },
  {
    name: 'line-numbers',
    source: `${fence}js:line-numbers\nlet a = 1\n${fence}`,
    check: (h) => /line-numbers-wrapper/.test(h),
  },
  {
    name: 'fuzzy-link-off',
    source: '见 example.com 与 https://a.com',
    check: (h) => h.includes('href="https://a.com"') && !h.includes('href="http://example.com"'),
  },
  { name: 'relative-md-link', source: '[文档](./foo.md)', check: (h) => /href="\/guide\/foo"/.test(h) },
  { name: 'relative-image', source: '![图](./a.png)', check: (h) => /src="\/guide\/a\.png"/.test(h) },
];
