// 水墨技能栏（模块 F）：出行局 r1 白天 / 夜里的局内 HUD 截图；锁定栏说明、冷却扫过、真气不足、丹药 / 遁地符格。
// 用法：node tools/run.mjs loop_skillbar scene=run&region=r1
const R = [];
const ok = (cond, msg, extra) => {
  R.push(!!cond);
  console.log((cond ? "PASS " : "FAIL ") + msg + (extra !== undefined ? " " + JSON.stringify(extra) : ""));
  if (!cond) process.exitCode = 1;
  return cond;
};

export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play", null, { timeout: 60000 });
  await c.wait(1500);
  const info = await c.ev(() => {
    const q = (s) => [...document.querySelectorAll(s)];
    const slots = q(".jx-slot");
    return {
      n: slots.length,
      ink: slots.every((d) => d.classList.contains("hud-skill")),
      locked: q(".jx-slot.locked .ct").map((e) => e.textContent),
      tal: !q(".jx-slot")[slots.length - 1].classList.contains("hide"),
      radius: getComputedStyle(slots[0]).borderRadius,
      border: getComputedStyle(slots[0]).borderTopWidth,
      mask: getComputedStyle(slots[0], "::after").webkitMaskImage.slice(0, 20),
    };
  });
  ok(info.n >= 8 && info.ink, "skill bar uses ink hud-skill slots", info);
  ok(info.border === "0px" && /url|image/.test(info.mask), "slots are enso masks, no box border", info);
  ok(info.locked.length > 0 && info.locked.every((t) => /^练气.+层解锁$/.test(t)), "locked slots say 练气X层解锁", info.locked);
  ok(info.tal, "talisman slot shown in run", info.tal);

  await c.shot("hud_day_locked_bar", { clip: { x: 160, y: 580, width: 960, height: 140 } });
  // 冷却 + 真气不足（装上三个法术、筑基三栏）
  await c.ev(() => {
    const S = window.__skills;
    S.setRealm("zhuji");
    S.setLoadout({ spells: ["sword_qi", "fire_talisman", "frost"], artifact: { id: "flying_sword", level: 1 }, formation: "sword_array" });
    S.cd.Q = 5;
    S.cdMax.Q = 8;
    S.cd.pot0 = 3;
    S.cdMax.pot0 = 10;
  });
  await c.wait(200);
  const cd = await c.ev(() => {
    const el = document.querySelectorAll(".jx-slot")[0];
    const cs = getComputedStyle(el.querySelector(".cd")), r = el.querySelector(".cd").getBoundingClientRect();
    return { cd: el.querySelector(".cd").style.getPropertyValue("--cd"), t: el.querySelector(".t").textContent, bg: cs.backgroundImage.slice(0, 90), w: r.width, z: cs.zIndex, op: cs.opacity, cls: el.className };
  });
  ok(+cd.cd > 0.5 && cd.t === "5", "cooldown sweep + seconds", cd);
  // 技能图标（意象写意，docs/ui/v2/png/skill_icons_compare.png）：法术 / 法宝 / 阵盘 / 丹药 / 遁地符都画图标，不再写单字
  const ic = await c.ev(() => {
    const sl = [...document.querySelectorAll(".jx-bar .jx-slot")].filter((d) => !d.classList.contains("hide"));
    return sl.map((d) => { const i = d.querySelector(".mk-ico"); return { k: d.querySelector(".k").textContent, on: !!i && !i.classList.contains("off") && /items\.webp/.test(i.style.backgroundImage), g: d.querySelector(".g").textContent }; });
  });
  ok(ic.length >= 8 && ic.every((x) => x.on && !x.g), "技能栏：圆相里是意象图标（无单字）", ic);
  const z = await c.ev(() => { const d = document.querySelector(".jx-bar .jx-slot"); const g = (s) => +getComputedStyle(d.querySelector(s)).zIndex || 0; return { ico: g(".mk-ico"), cd: g(".cd"), k: g(".k"), t: g(".t") }; });
  ok(z.ico < z.cd && z.cd < z.k && z.cd < z.t, "图标在冷却墨扇之下，按键角标与秒数在最上", z);
  await c.shot("hud_day");
  await c.shot("hud_day_bar", { clip: { x: 160, y: 580, width: 960, height: 140 } });
  await c.ev(() => {
    const S = window.__skills;
    S.cd = {};
    S.hero.mp = 0;
  });
  await c.wait(200);
  ok(await c.ev(() => document.querySelectorAll(".jx-slot")[0].classList.contains("nomp")), "insufficient mp state");
  await c.shot("hud_nomp_bar", { clip: { x: 160, y: 580, width: 960, height: 140 } });

  // "势"格（右键 · 蓄势斩）：气势环 + 可放 / 势成；法宝格角标改 V
  const keys = await c.ev(() => [...document.querySelectorAll(".jx-bar .jx-slot")].map((d) => d.querySelector(".k").textContent));
  ok(keys.indexOf("右键") === 3 && keys.indexOf("V") === 4 && keys.indexOf("T") === 5, "技能栏：右键位是势格，法宝改 V", keys);
  const mom = async (m) => {
    await c.ev((m) => ((__game.player.momentum = m), (__game.player.momT = 0)), m);
    await c.wait(250);
    return c.ev(() => {
      const d = [...document.querySelectorAll(".jx-bar .jx-slot")].find((x) => x.querySelector(".k").textContent === "右键");
      const i = d.querySelector(".mk-ico");
      return { cls: d.className, mv: +d.style.getPropertyValue("--mv"), c: d.querySelector(".c").textContent, ico: !!i && !i.classList.contains("off") && /items\.webp/.test(i.style.backgroundImage), ring: !!d.querySelector(".mr") };
    });
  };
  const m30 = await mom(30), m60 = await mom(60);
  await c.shot("hud_mom_half_bar", { clip: { x: 160, y: 580, width: 960, height: 140 } });
  const m100 = await mom(100);
  await c.shot("hud_mom_full_bar", { clip: { x: 160, y: 580, width: 960, height: 140 } });
  ok(m30.ico && m30.ring && !/half|full/.test(m30.cls) && m30.c === "30", "势格：图标 + 气势环；<50 不可放", m30);
  ok(/half/.test(m60.cls) && !/full/.test(m60.cls) && Math.abs(m60.mv - 0.6) < 0.01, "势格：≥50 淡金'可放'", m60);
  ok(/full/.test(m100.cls) && m100.c === "势成", "势格：满 = 势成泛金", m100);
  await c.ev(() => (__game.player.momentum = 0));

  // 夜里
  await c.ev(() => {
    const r = __game.run;
    r.t = r.R.phases[2] + 5;
    const S = window.__skills;
    S.hero.mp = S.hero.stats.get("mp");
    S.cd.E = 4;
    S.cdMax.E = 10;
  });
  await c.wait(2500);
  await c.shot("hud_night");
  await c.shot("hud_night_bar", { clip: { x: 160, y: 580, width: 960, height: 140 } });
  console.log(`\n${R.filter(Boolean).length}/${R.length} passed`);
}
