// 委托与奇遇（模块 E，src/game/quests/index.js）的接入层：存在才用，不存在或出错时流程照常运行（懒加载，坏掉的模块不会拖垮启动）。
//   E 导出 class Quests(ctx)：offers(profile) → [3 个委托]、accept(ids)、start(run)、progress() → [{id, text, done}]、settle(run, result) → 奖励
const loaders = import.meta.glob("../quests/index.js");
const load = Object.values(loaders)[0] || null;
let mod = null;
export const questsReady = load
  ? load()
      .then((m) => (mod = m))
      .catch((e) => console.error("[flow] 委托模块加载失败，本次不启用", e))
  : Promise.resolve(null);

let inst = null;
export function getQuests(ctx) {
  if (!mod || !mod.Quests) return null;
  if (!inst) {
    try {
      inst = new mod.Quests(ctx);
    } catch (e) {
      console.error("[flow] 委托模块初始化失败", e);
      return null;
    }
  }
  return inst;
}
export const hasQuests = () => !!(mod && mod.Quests);
export function resetQuests() {
  inst = null;
}
