// 资源地址：单文件分享包（tools/pack.mjs）把模型以 data URL 写进 window.__EMBED，按原路径查表；开发时原样返回路径
export function assetURL(p) {
  const E = typeof window !== "undefined" && window.__EMBED;
  return (E && E[p]) || p;
}
export const isEmbedded = (p) => assetURL(p) !== p;
