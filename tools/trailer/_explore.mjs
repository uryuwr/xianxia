// 探索用：打开某场景，按给定位置截静帧。node tools/trailer/_explore.mjs "<query>" "<js setup>" x,z;x,z ...
import { launch, Rec, VIDEO } from "./lib.mjs";
import path from "node:path";
const [query, setup = "", ...pts] = process.argv.slice(2);
const S = await launch({});
const tab = await S.open({ settings: { hints: false } });
const R = new Rec(S, tab, path.join(VIDEO, "explore"));
await R.go(query);
await R.page.waitForFunction(() => (!__game.flow.run || __game.flow.run.state === "play") && __game.heroSource, null, { timeout: 120000 });
await R.real(1500);
if (setup) console.log("setup:", await R.ev(setup));
await R.begin();
let i = 0;
for (const p of pts.length ? pts : ["cur"]) {
  if (p !== "cur") {
    const [x, z, view] = p.split(",");
    await R.ev(([x, z, view]) => { __game.player.spawn(+x, +z); if (view) __game.rig.set(view, true); __game.rig.update(1, true); }, [x, z, view]);
  }
  await R.skip(20);
  const f = path.join(VIDEO, "explore", `e${i++}.png`);
  await R.png(f);
  console.log(f, p);
}
console.log(S.logs.join("\n"));
await S.close();
