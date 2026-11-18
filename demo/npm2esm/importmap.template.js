// npm2esm 注入用模板：带标记的那一行会被依赖条目整行替换，产物 URL 统一追加
// ?v=<版本>-<内容 hash>。
const importMap = {
  imports: {
    // mermaid 引的是 es-toolkit/compat 这个深层路径，npm2esm 只能按包名生成条目，
    // 精确映射在这里手写；es-toolkit/ 前缀由同包子目录产物自动补充
    'es-toolkit/compat': './lib/es-toolkit/compat/index.js',
    // __NPM2ESM_IMPORT_MAP__
  },
};
const script = document.createElement('script');
script.type = 'importmap';
script.textContent = JSON.stringify(importMap, null, 2);
document.currentScript.after(script);
