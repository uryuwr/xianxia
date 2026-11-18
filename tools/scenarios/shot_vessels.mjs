// 器物插画对比截图（设计对比用，不是回归测试）：node tools/run.mjs shot_vessels
// 在真实的丹器房页面里把炼器鼎 / 丹炉换成 tools/vessels/vessels.js 的各个变体（先跑 node tools/vessel_gen.mjs 烘焙），
// 截"炼器 · 装备""炼器 · 六味材料""炼丹 · 火候进行中"，输出到 docs/ui/v2/forge_v2/vessels/page_*.png，供 docs/ui/v2/forge_v2/vessels.html 对比。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "docs", "ui", "v2", "forge_v2", "vessels");
const STUB = `
const sheets = new Map();
export function updateStyle(id, css) { let s = sheets.get(id); if (!s) { s = document.createElement("style"); document.head.appendChild(s); sheets.set(id, s); } s.textContent = css; }
export function removeStyle(id) { const s = sheets.get(id); if (s) (s.remove(), sheets.delete(id)); }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;

export default async function (page, c) {
  await page.route(/\/@vite\/client(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: STUB }));
  const base = page.url().replace(/\/(\?.*)?$/, "");
  await page.goto(`${base}/src/game/cave/dev.html?preset=rich`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true && window.__cave && window.__cave.active, null, { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector(".cv-loading"), null, { timeout: 60000 }).catch(() => {}); // 进场遮罩（场景分帧构建）退掉再截图
  await c.wait(800);
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, "meta.json"), "utf8"));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => {
    const cv = window.__cave, p = cv.p, F = cv.F, g = window.__cdev.give;
    F.caveState(p).facilities.furnace = 1;
    F.caveState(p).facilities.forge = 1;
    g(p, "铁精石", 1, { rarity: 1 }); g(p, "铁精石", 1, { rarity: 2 });
    // 示意用的六味器方（只为看材料位能排到 6 味）
    F.recipes().forge.push({ id: "demo6", name: "示意 · 六味", kind: "gear", out: "青锋剑", inputs: { 铁精石: 2, 狼妖牙: 1, 狼皮: 2, 灵玉: 1, 青灵草: 2, 灵土: 9 }, stones: 30, forge: 1, known: !0 });
    cv.changed({ silent: !0 });
  });
  const save = async (name) => {
    const f = await c.shot("v_" + name);
    fs.copyFileSync(f, path.join(OUT, "page_" + name + ".png"));
  };
  const setVessel = (kind, id) => ev(async ([kind, url, m]) => {
    const mod = await import("/src/ui/cave/workshop_v2.js");
    mod.VESSELS[kind] = url ? { url, meta: m } : { url: kind === "ding" ? mod.VESSELS.__dingSvg || mod.VESSELS[kind].url : null, meta: null };
  }, [kind, id ? `/docs/ui/v2/forge_v2/vessels/${id}.png` : null, id ? meta.meta[id] : null]);
  const forge = async (rec) => {
    await ev((rec) => { const cv = window.__cave; cv.ui.close(); cv.open("forge", "forge", { sel: { cat: "gear", rec } }); }, rec);
    await c.wait(700);
  };
  // 现状（旧插画）；首次打开前多等一会儿，等洞府进场画面退掉
  await c.wait(2500);
  await forge("sword");
  await c.wait(800);
  await save("ding_old");
  for (const [id] of meta.variants.ding) {
    await setVessel("ding", id);
    await forge("sword");
    await save(id);
    await forge("demo6");
    await save(id + "_six");
  }
  const brew = async (name) => {
    await ev(() => { const cv = window.__cave, r = cv.F.recipes().alchemy.find((x) => x.id === "huichun"); for (const x of cv.F.inputsOf(cv.p, r, 1)) if (x.have < x.need) window.__cdev.give(cv.p, x.name, x.need - x.have); cv.ui.close(); cv.debug.alchemyTime = 30; cv.debug.alchemyTemp = 0.55; cv.open("furnace", "alchemy", { sel: { rec: "huichun" } }); });
    await c.wait(500);
    await page.click("[data-act=brew]");
    await c.wait(1500);
    await save(name);
    await ev(() => { const cv = window.__cave; cv.ui.fire = null; cv.ui.close(); });
    await c.wait(200);
  };
  await brew("furnace_old");
  for (const [id] of meta.variants.furnace) {
    await setVessel("furnace", id);
    await brew(id);
  }
  console.log("PASS shot_vessels");
}
