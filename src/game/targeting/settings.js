// 游戏设置（本地保存，键 moxian.settings）。流程模块的设置界面也可以读写这里。
//   quickCast  快速施法：按技能键立即在鼠标处释放（默认关闭：先显示虚影预览，左键确认）
const KEY = "moxian.settings";
const DEFAULTS = { quickCast: !1 };

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}
export function getSetting(k) {
  const s = readAll();
  return k in s ? s[k] : DEFAULTS[k];
}
export function setSetting(k, v) {
  const s = readAll();
  s[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
  dispatchEvent(new CustomEvent("moxian:settings", { detail: { key: k, value: v } }));
  return v;
}
