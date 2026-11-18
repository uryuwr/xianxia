// 临时探针：旧存档玉佩退回提示为何不见
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play", null, { timeout: 120000 });
  await c.wait(800);
  await c.ev(async () => {
    const L = await import("/src/game/loot.js");
    const P = __game.run.profile;
    __game.debug.realm(1, 1);
    window.__jade = L.makeGear("jade_qing", 1, 1, { identified: !0 });
    P.equip.jade = window.__jade;
    window.__log = [];
    window.__rm = [];
    const orig = Element.prototype.remove;
    Element.prototype.remove = function () { if (this.classList && (this.classList.contains("ink-toast") || this.classList.contains("cv-toasts") || this.classList.contains("cv-root"))) window.__rm.push(this.className + " " + (new Error().stack || "").split("
").slice(1, 6).join(" <- ")); return orig.call(this); };
    __game.world.events.on("cave:enter", () => window.__log.push(["enter", !!__game.flow.profile.equip.jade, [...document.querySelectorAll(".cv-toasts > *")].map((e) => e.textContent + "@" + e.style.getPropertyValue("--d")), __game.flow.profile.storage.items.some((x) => x.uid === window.__jade.uid)]));
  });
  await c.ev(() => __game.debug.extract());
  await page.waitForFunction(() => __game.flow.name === "result", null, { timeout: 30000 });
  await c.wait(1200);
  console.log("at result jade", await c.ev(() => !!__game.flow.profile.equip.jade));
  await c.ev(() => __game.flow.go("cave", { from: "result", result: {} }));
  for (let i = 0; i < 20; i++) {
    await c.wait(1000);
    const s = await c.ev(() => ({ name: __game.flow.name, active: !!(window.__cave && __cave.active), loading: !!document.querySelector(".cv-loading"), toasts: [...document.querySelectorAll(".cv-toasts > *")].map((e) => e.textContent), jade: !!__game.flow.profile.equip.jade, log: window.__log, rm: window.__rm }));
    console.log(i, JSON.stringify(s));
    if (s.active && !s.loading && i > 4) break;
  }
}
