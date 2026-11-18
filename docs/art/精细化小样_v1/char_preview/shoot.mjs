// 角色 / 首领对比截图：先起 vite（npx vite --port 5191 --strictPort），再
//   node docs/art/精细化小样_v1/char_preview/shoot.mjs [名字过滤…]  → docs/art/精细化小样_v1/png/<名>.png
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "..", "png");
const BASE = process.env.BASE || "http://localhost:5191/docs/art/精细化小样_v1/char_preview/index.html";
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const SHOTS = [
  // 名字, 查询串, 视口, 裁剪
  ["qingya_game", "kind=qingya&view=game&clip=idle&t=0.6", [1600, 900], { x: 400, y: 150, width: 800, height: 560 }],
  ["qingya_close", "kind=qingya&view=close&clip=idle&t=0.6&set=lAvAvBvC", [1600, 1000]],
  ["qingya_side", "kind=qingya&view=side&clip=idle&t=0.6&set=lAvB", [1800, 560]],
  ["qingya_front", "kind=qingya&view=front&clip=idle&t=0.6&set=lAvBvC", [1500, 600]],
  ["qingya_head", "kind=qingya&view=head&clip=idle&t=0.6&set=lAvBvC&yaw=0.9", [1800, 600]],
  ["qingya_bite", "kind=qingya&view=side&clip=attack_bite&t=0.32&set=lAvBvC&yaw=1.3", [1800, 520]],
  ["qingya_p2", "kind=qingya&view=close&clip=idle&t=0.6&set=lAvBvC&p2=1&yaw=0.9", [1800, 560]],
  ["qingya_game_p2", "kind=qingya&view=game&clip=idle&t=0.6&p2=1", [1600, 900], { x: 400, y: 150, width: 800, height: 560 }],
  ["hero_rest", "kind=hero&view=front&clip=none&set=vAvBvC&ink=0", [1500, 900]],
  ["hero_game", "kind=hero&view=game&clip=idle&t=0.6", [1600, 900], { x: 500, y: 300, width: 600, height: 300 }],
  ["hero_close", "kind=hero&view=close&clip=idle&t=0.6&set=lAvAvBvC", [1800, 900]],
  ["hero_front", "kind=hero&view=front&clip=idle&t=0.6&set=lAvBvC", [1500, 900]],
  ["hero_side", "kind=hero&view=side&clip=idle&t=0.6&set=lAvBvC", [1500, 900]],
  ["hero_back", "kind=hero&view=back&clip=idle&t=0.6&set=lAvBvC", [1500, 900]],
  ["hero_head", "kind=hero&view=head&clip=idle&t=0.6&set=lAvBvC&yaw=0.35", [1500, 800]],
  ["hero_slash", "kind=hero&view=close&clip=slash1&t=0.22&set=lAvBvC", [1600, 900]],
  ["hero_run", "kind=hero&view=close&clip=run&t=0.2&set=lAvBvC&yaw=1.2", [1600, 900]],
];
const want = process.argv.slice(2);
const b = await chromium.launch({ executablePath: exe, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
for (const [name, q, vp, clip] of SHOTS) {
  if (want.length && !want.some((w) => name.includes(w))) continue;
  const p = await b.newPage({ viewport: { width: vp[0], height: vp[1] } });
  p.on("pageerror", (e) => console.log("[err]", name, e.message));
  p.on("console", (m) => m.type() === "error" && console.log("[console]", name, m.text()));
  await p.goto(BASE + "?" + q);
  await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const err = await p.evaluate(() => window.__err);
  if (err) console.log("[fail]", name, err);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, name + ".png"), clip });
  console.log("ok", name, JSON.stringify(await p.evaluate(() => window.__info)));
  await p.close();
}
await b.close();
