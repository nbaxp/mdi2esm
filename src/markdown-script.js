// <script>/<script setup> 处理：import 提升到模块顶层，经 Blob URL 动态 import 执行。
// <script setup>：body 包在 setup 内保证每实例独立状态，绑定返回给模板；
// 普通 <script>：整个模块体原样保留（import + export default 选项对象），默认导出并入文档组件。
// 相对 specifier 与 setup 上下文注入由 config.adapters 提供，渲染层不含宿主路径规则。
import { createConfig } from './config.js';
import { resolvePath } from './render.js';

const IMPORT_RE = /^[ \t]*import\s+(?:([\w$*{},: ]+?)\s+from\s+)?['"]([^'"]+)['"]\s*;?[ \t]*$/gm;

function parseImportClause(clause) {
  const out = [];
  const trimmed = clause.trim();
  const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(trimmed);
  const named = /\{([^}]*)\}/.exec(trimmed);
  if (namespace) out.push({ local: namespace[1], prop: '*' });
  if (named) {
    for (const seg of named[1].split(',')) {
      const item = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(seg.trim());
      if (item) out.push({ local: item[2] ?? item[1], prop: item[1] });
    }
  }
  if (!namespace && !named) {
    const local = /^([A-Za-z_$][\w$]*)/.exec(trimmed);
    if (local) out.push({ local: local[1], prop: 'default' });
  }
  return out;
}

// 提升 import：相对路径解析交给宿主适配器，裸包名（含 '@/...'）交给 importmap
function hoistImports(code, dir, config) {
  const importLines = [];
  const bindings = [];
  const body = code.replace(IMPORT_RE, (match, clause, spec) => {
    const target = config.adapters.toScriptImport({
      spec,
      resolved: spec.startsWith('.') ? resolvePath(dir, spec) : spec,
      dir,
      config,
    });
    importLines.push(clause ? `import ${clause} from '${target}';` : `import '${target}';`);
    if (clause) bindings.push(...parseImportClause(clause).map(({ local }) => local));
    return '';
  });
  return { importLines: importLines.join('\n'), body, bindings };
}

// 普通 <script>：模块体原样（作者自己写 export default），仅提升 import
export function buildScriptModuleSource(scripts, dir, config = createConfig()) {
  const plain = scripts.filter((item) => !/\bsetup\b/.test(item.attrs));
  if (plain.length === 0) return null;
  const { importLines, body } = hoistImports(plain.map((item) => item.content).join('\n'), dir, config);
  return body.trim() ? `${importLines}\n${body}` : null;
}

async function importModuleSource(moduleSource, onError) {
  if (moduleSource === null) return null;
  const url = URL.createObjectURL(new Blob([moduleSource], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ url);
  } catch (err) {
    onError(err);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createScriptModule(scripts, dir, config = createConfig()) {
  const module = await importModuleSource(buildScriptModuleSource(scripts, dir, config), (err) =>
    console.warn('[markdown-it] <script> 执行失败，忽略该脚本：', err),
  );
  return module?.default ?? null;
}

// <script setup>：拼成真 ESM（import 留模块顶层）经 Blob URL 动态加载，
// frontmatter / params 由 config.adapters.scriptContext 注入 setup 作用域
export function buildSetupModuleSource(scripts, dir, frontmatter, params, config = createConfig()) {
  const setup = scripts.filter((item) => /\bsetup\b/.test(item.attrs));
  if (setup.length === 0) return null;
  const { importLines, body, bindings } = hoistImports(setup.map((item) => item.content).join('\n'), dir, config);
  const ctx = config.adapters.scriptContext({ dir, config, frontmatter, params });
  const injected =
    `const frontmatter = ${JSON.stringify(ctx.frontmatter ?? {})};\n` +
    `const params = ${JSON.stringify(ctx.params ?? {})};\n`;

  const declared = [...body.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const exposed = [...new Set([...bindings, ...declared])];
  return `${importLines}
export function setup() {
${injected}${body}
return { ${exposed.map((n) => `${n}: ${n}`).join(', ')} };
}`;
}

export async function createSetup(scripts, dir, frontmatter, params, config = createConfig()) {
  const module = await importModuleSource(buildSetupModuleSource(scripts, dir, frontmatter, params, config), (err) =>
    console.warn('[markdown-it] <script setup> 执行失败，已降级为无脚本渲染：', err),
  );
  return module?.setup ?? null;
}
