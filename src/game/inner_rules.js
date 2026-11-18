// 内观阁的规则侧小函数（UI 设计 2026-11-17）：给"今日可办"一行用，不依赖界面模块。
//   innerTodo(p) → null | { text: "内观阁：R 栏空着 · 可装寒冰锥", tab: "spell" | "xinfa" }
//   只在"有已解锁的空栏、且有已领悟但没装的功法"时提示（空着又没得装，不催）。
import { SPELLS } from "../data/skills.js";
import { XINFA } from "../data/items.js";

export function innerTodo(p) {
  if (!p || !p.unlocks) return null;
  const b = p.build || {}, L = (p.flags && p.flags.learned) || {};
  const sp = b.spells || [], n = p.unlocks.spellSlots ?? 1;
  const spareS = (L.spells || []).filter((id) => SPELLS[id] && !sp.slice(0, n).includes(id));
  const emptyS = [0, 1, 2].filter((i) => i < n && !sp[i]);
  if (emptyS.length && spareS.length) return { text: `内观阁：${emptyS.map((i) => "QER"[i]).join(" ")} 栏空着 · 可装${SPELLS[spareS[0]].name}`, tab: "spell" };
  const xs = b.xinfa || [], nx = p.unlocks.xinfaSlots || 0;
  const spareX = (L.xinfa || []).filter((id) => XINFA[id] && !XINFA[id].retired && !xs.slice(0, nx).includes(id));
  const emptyX = [0, 1].filter((i) => i < nx && !xs[i]);
  if (emptyX.length && spareX.length) return { text: `内观阁：心法栏空着 · 可装《${XINFA[spareX[0]].name}》`, tab: "xinfa" };
  return null;
}
