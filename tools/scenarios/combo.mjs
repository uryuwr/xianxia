// 连段调试：记录播放过的动作序列
export default async function (page, c) {
  await c.wait(2500);
  await c.ev(() => { const p = window.__game.player; window.__seq = []; const orig = p.play.bind(p); p.play = (n, f, o) => (window.__seq.push(n + "@" + performance.now().toFixed(0)), orig(n, f, o)); window.__dur = Object.fromEntries(Object.entries(p.actions).map(([k, a]) => [k, +a.getClip().duration.toFixed(2)])); });
  for (let k = 0; k < 3; k++) { await page.mouse.click(640, 360); await c.wait(140); }
  await c.wait(2500);
  c.log("dur", JSON.stringify(await c.ev(() => window.__dur)));
  c.log("seq", JSON.stringify(await c.ev(() => window.__seq)));
}
