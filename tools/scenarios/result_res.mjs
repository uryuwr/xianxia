// 结算手卷：三种分辨率下展开完成后不裁切；账目数值在展开前就已填好；最终状态无 clip-path
// 用法：node tools/run.mjs result_res scene=title
const ok = (v, name, extra) => console.log(`${v ? "PASS" : "FAIL"} ${name}${extra !== undefined ? " " + JSON.stringify(extra).slice(0, 600) : ""}`);
const RES = [[1920, 1080], [1600, 900], [1280, 720]];

export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.flow && __game.flow.name === "title", null, { timeout: 90000 });
  for (const [w, h] of RES) {
    await page.setViewportSize({ width: w, height: h });
    await c.wait(300);
    await c.ev(async () => {
      const { makeItem, ITEMS } = await import("/src/core/items.js");
      const ids = Object.keys(ITEMS);
      const pick = (re) => ids.find((k) => re.test(k)) || ids[0];
      const kept = [makeItem("spirit_stone", { n: 37 }), makeItem(pick(/herb|grass/)), makeItem(pick(/ore|iron/)), makeItem(pick(/core/))].filter(Boolean);
      if (!__game.flow.profile) __game.flow.newGame(3);
      const lost = [makeItem(pick(/beast|hide|fang/))].filter(Boolean);
      __game.flow.go("result", {
        result: { result: "extract", regionName: "青溪谷", via: "溪畔石桥 · 古传送阵（东岸残碑旁）", time: 549, kills: 23, elites: 2, tide: 1.6, insight: 40, kept, lost, carriedLeft: [], firsts: ["溪畔石桥", "古传送阵"] },
      });
    });
    // (2) 展开动画进行中，账目各行的数值已经写好
    await page.waitForFunction(() => document.querySelector(".mk-result .scroll .core"), null, { timeout: 10000 });
    await c.wait(250);
    const mid = await c.ev(() => {
      const core = document.querySelector(".mk-result .scroll .core");
      const rows = [...document.querySelectorAll(".mk-result .seg3 .ink-row")].map((r) => [r.querySelector(".k").textContent, r.querySelector(".v").textContent]);
      return { anim: core.classList.contains("fx-unroll"), clip: getComputedStyle(core).clipPath, rows };
    });
    ok(mid.rows.length >= 4 && mid.rows.every(([k, v]) => k && v.trim()), `${w}x${h}: ledger values filled during unroll`, mid);
    await c.shot(`${w}x${h}_mid`);
    // (1)(3) 展开完成：无 clip-path，各段在卷心内、文字不溢出
    await c.wait(1400);
    const fin = await c.ev(() => {
      const core = document.querySelector(".mk-result .scroll .core");
      const cr = core.getBoundingClientRect();
      const out = [];
      const inside = (el, name) => {
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < cr.left - 1 || r.right > cr.right + 1 || r.top < cr.top - 1 || r.bottom > cr.bottom + 1)) out.push(name);
      };
      inside(document.querySelector(".mk-result .seg1 .por img") || document.querySelector(".mk-result .seg1 .por"), "portrait");
      inside(document.querySelector(".mk-result .seg1 .xp"), "xp");
      document.querySelectorAll(".mk-result .core > *").forEach((e, i) => inside(e, "core>" + e.className + i));
      const clipped = [];
      document.querySelectorAll(".mk-result .seg3 .ink-row .k, .mk-result .seg3 .ink-row .v, .mk-result .seg1 .xp .r, .mk-result .seg1 .carry").forEach((e) => {
        if (e.scrollWidth > e.clientWidth + 1) clipped.push(e.textContent);
      });
      const seg3 = document.querySelector(".mk-result .seg3");
      if (seg3.scrollHeight > seg3.clientHeight + 1) clipped.push("seg3 height " + seg3.scrollHeight);
      const via = [...document.querySelectorAll(".mk-result .seg3 .ink-row .v")][1];
      return { clip: getComputedStyle(core).clipPath, anim: core.classList.contains("fx-unroll"), out, clipped, via: via.textContent, viaFs: getComputedStyle(via).fontSize, viaH: via.getBoundingClientRect().height, scale: getComputedStyle(document.documentElement).getPropertyValue("--mk-scale") };
    });
    ok(fin.clip === "none" && !fin.anim, `${w}x${h}: no clip-path after unroll`, fin.clip);
    ok(!fin.out.length, `${w}x${h}: every segment sits inside the scroll`, fin.out);
    ok(!fin.clipped.length, `${w}x${h}: no truncated text (long place name shrinks / wraps)`, fin);
    await c.shot(`${w}x${h}`);
  }
}
