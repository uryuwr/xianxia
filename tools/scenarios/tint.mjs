// 淡彩对比：同一机位 纯墨 / 淡彩
export default async function (page, c) {
  await c.wait(2500);
  for (const v of ["play", "waterfall", "bamboo"]) {
    await c.ev((v) => __game.setView(v), v);
    await c.wait(700);
    await c.ev(() => __game.setTint(0)); await c.wait(150); await c.shot(v + "_ink");
    await c.ev(() => __game.setTint(1)); await c.wait(150); await c.shot(v + "_tint");
  }
}
