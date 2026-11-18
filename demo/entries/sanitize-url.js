// @braintree/sanitize-url 7.x 只有 CJS 产物（无 exports / module 字段），esbuild 直接打包
// 只会生成 default 导出，而 mermaid 引的是具名 sanitizeUrl。这里显式转成 ESM 具名导出。
import pkg from '@braintree/sanitize-url';

export const sanitizeUrl = pkg.sanitizeUrl;

export default pkg.sanitizeUrl;
