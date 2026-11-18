// 仓库"身上"装备位与详情：仙品角印是否带字、是否与名称旁品级印重复。用法：node tools/run.mjs storage_seal "scene=cave&slot=3"
export default async function (page, c) {
  await page.waitForFunction(() => window.__cave && __cave.scene && __cave.scene.stations && window.__game && __game.flow && __game.flow.name === "cave", null, { timeout: 60000 });
  await c.ev(async () => {
    const { makeItem } = await import("/src/core/items.js");
    const P = __game.profile;
    P.flags.tutorialDone = !0;
    P.realm = { stage: 1, layer: 5 };
    P.equip.sword = makeItem("sword_qingfeng", { rarity: 3, level: 2, identified: !0 });
    window.__cave.open("storage");
  });
  await page.waitForFunction(() => document.querySelector('.equip [data-slot="sword"]'), null, { timeout: 30000 });
  await c.wait(5000);
  await c.ev(() => document.querySelector('.equip [data-slot="sword"]').click());
  await c.wait(500);
  const r = await c.ev(() => [...document.querySelectorAll(".mk-tok > .cs")].map((e) => {
    const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return { t: e.textContent, w: Math.round(b.width), fs: cs.fontSize, color: cs.color, ff: cs.fontFamily.slice(0, 40), op: cs.opacity, inSlot: !!e.closest("[data-slot]") };
  }).concat([...document.querySelectorAll(".equip .ink-slot > i")].map((e) => ({ slotSeal: e.textContent }))));
  console.log(JSON.stringify(r));
  const ok = (c, m, x) => console.log((c ? "PASS " : "FAIL ") + m + " " + JSON.stringify(x));
  ok(r.some((x) => x.slotSeal === "仙"), "身上装备位的仙品角印带字", r);
  ok(!r.some((x) => x.t && !x.inSlot && x.w > 20), "详情大图不再叠角印（名字旁已有品级印）", r);
  await c.shot("storage_seal");
}
