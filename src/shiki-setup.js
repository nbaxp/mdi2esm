// Shiki 装配（对齐 mdoc 的 shiki-setup.js）：
// - 语言/主题走 shiki/ 前缀的裁剪产物，由 importmap 解析（前缀条目无 ?v= 版本参数）
// - highlighter 惰性单例 + codeToHtml 封装，避免加载全量 361 语言数据
import { createHighlighterCore } from 'shiki/core';
import bat from 'shiki/dist/langs/bat.mjs';
import csharp from 'shiki/dist/langs/csharp.mjs';
import css from 'shiki/dist/langs/css.mjs';
import diff from 'shiki/dist/langs/diff.mjs';
import dockerfile from 'shiki/dist/langs/dockerfile.mjs';
import go from 'shiki/dist/langs/go.mjs';
import html from 'shiki/dist/langs/html.mjs';
import java from 'shiki/dist/langs/java.mjs';
import javascript from 'shiki/dist/langs/javascript.mjs';
import json from 'shiki/dist/langs/json.mjs';
import markdown from 'shiki/dist/langs/markdown.mjs';
import powershell from 'shiki/dist/langs/powershell.mjs';
import python from 'shiki/dist/langs/python.mjs';
import shellscript from 'shiki/dist/langs/shellscript.mjs';
import sql from 'shiki/dist/langs/sql.mjs';
import typescript from 'shiki/dist/langs/typescript.mjs';
import vue from 'shiki/dist/langs/vue.mjs';
import vueHtml from 'shiki/dist/langs/vue-html.mjs';
import xml from 'shiki/dist/langs/xml.mjs';
import yaml from 'shiki/dist/langs/yaml.mjs';
import githubDark from 'shiki/dist/themes/github-dark.mjs';
import githubLight from 'shiki/dist/themes/github-light.mjs';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

// 语言集 T2（对齐 mdoc）：20 语言，纯 JS 正则引擎，不加载 WASM
const langs = [
  javascript,
  typescript,
  json,
  sql,
  csharp,
  xml,
  yaml,
  shellscript,
  bat,
  diff,
  dockerfile,
  powershell,
  markdown,
  html,
  css,
  vue,
  python,
  go,
  java,
  vueHtml,
].flat();

// VitePress 默认双主题：github-light / github-dark
const themes = [githubDark, githubLight];

export const languages = langs.map((lang) => lang.name);
export const themeNames = themes.map((theme) => theme.name);

let highlighter;

export function createHighlighter() {
  highlighter ??= createHighlighterCore({
    langs,
    themes,
    // extractLang 把 ```vue-html 转成 template，而 shiki 注册名为 vue-html
    langAlias: { template: 'vue-html' },
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

export async function codeToHtml(code, options) {
  return (await createHighlighter()).codeToHtml(code, options);
}
