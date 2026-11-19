// 惰性加载可选依赖：promise 缓存 + 失败回 null，避免重复 import 与未处理的拒绝。
// onFail 只负责告警（可选），返回值恒为 null 供调用方降级。
export function lazyModule(importFn, onFail) {
  let promise;
  return () =>
    (promise ??= importFn().catch((err) => {
      onFail?.(err);
      return null;
    }));
}
