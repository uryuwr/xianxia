// 用游戏自己的 Heightfield（src/world/heightfield.js）把关卡数据烘成网格，导出给 Python 做寻路 / 出图。
// 用法：node docs/review/level/tools/export_hf.mjs <关卡模块路径> <输出前缀>
//   输出 <前缀>.json（元数据 + 原始 def）与 <前缀>.bin（float32：walk、ground、riverDist 三层）
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../../..");
const hfPath = process.env.HF ? path.resolve(process.env.HF) : path.join(root, "src/world/heightfield.js");
const { Heightfield } = await import(pathToFileURL(hfPath).href);
const [, , defPath, outPrefix] = process.argv;
const def = (await import(pathToFileURL(path.resolve(defPath)).href)).default;
const hf = new Heightfield(def);
const N = hf.nx * hf.nz;
const buf = new Float32Array(N * 3);
buf.set(hf.walkG, 0);
buf.set(hf.groundG, N);
buf.set(hf.riverDG, 2 * N);
writeFileSync(outPrefix + ".bin", Buffer.from(buf.buffer));
writeFileSync(outPrefix + ".json", JSON.stringify({ nx: hf.nx, nz: hf.nz, cell: hf.cell, x0: hf.x0, z0: hf.z0, buildMs: hf.buildMs, def }));
console.log(def.id, hf.nx + "x" + hf.nz, Math.round(hf.buildMs) + "ms");
