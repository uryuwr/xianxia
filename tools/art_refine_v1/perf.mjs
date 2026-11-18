// 精细化小样 v1 · 代价实测：node tools/art_refine_v1/perf.mjs [igpu]
//   对 现状 / A / B / C / B+游戏预算 五种状态，在 1280×720（像素比 1）与 1920×1080 全窗口（像素比 1.5 = 高档上限）下，
//   各跑 3 轮"背靠背 40 帧 GPU 计时"取最小的中位数；同时记 draw call、三角面、贴图显存、CPU 提交毫秒。
//   igpu：Chromium 加 --force_low_power_gpu（本机 Intel UHD 630），估普通集显笔记本的代价。
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(DIR, "../../docs/art/精细化小样_v1/index.html");
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const igpu = process.argv.includes("igpu");
const b = await chromium.launch({ executablePath: exe, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", ...(igpu ? ["--force_low_power_gpu"] : [])] });
const STATES = [["现状", "ver=old"], ["A", "ver=new&shade=A"], ["B", "ver=new&shade=B"], ["C", "ver=new&shade=C"], ["B 预算", "ver=new&shade=B&lod=budget"]];
// 独显：720p 与 1080p×1.5（高档上限）；集显：游戏"中"档的像素口径 1536×864（1080p@125% 缩放，像素比上限 1）
const SIZES = igpu
  ? [["720p×1", { width: 1280, height: 720, dpr: 1, hash: "size=720&pr=1" }], ["1536×864", { width: 1536, height: 864, dpr: 1.25, hash: "size=full&pr=1" }]]
  : [["720p×1", { width: 1280, height: 720, dpr: 1, hash: "size=720&pr=1" }], ["1080p×1.5", { width: 1920, height: 1080, dpr: 1.5, hash: "size=full&pr=1.5" }]];
const rows = [];
for (const [sn, S] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: S.width, height: S.height }, deviceScaleFactor: S.dpr });
  for (const [name, h] of STATES) {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log("[err]", e.message));
    await p.goto(pathToFileURL(PAGE).href + "#" + h + "&cam=game&" + S.hash);
    await p.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(async () => {
      const v = [];
      for (let k = 0; k < 3; k++) v.push(await window.__demo.bench(40));
      const ok = v.filter((x) => x != null);
      return { gpu: ok.length ? Math.min(...ok) : NaN, calls: window.__demo.calls, cpu: window.__demo.cpu, tris: document.getElementById("tris").textContent, vram: document.getElementById("vram").textContent, gpuName: document.getElementById("gpuname").textContent, px: [document.getElementById("view").width, document.getElementById("view").height] };
    });
    rows.push({ size: sn, state: name, ...r });
    console.log(sn.padEnd(10), name.padEnd(6), "GPU", r.gpu.toFixed(2).padStart(6), "ms  calls", r.calls, " tris", r.tris, " 贴图", r.vram, " cpu", r.cpu.toFixed(2), " 画布", r.px.join("×"));
    await p.close();
  }
  await ctx.close();
}
console.log(rows[0] && rows[0].gpuName);
fs.writeFileSync(path.join(path.dirname(PAGE), igpu ? "perf_igpu.json" : "perf_3070.json"), JSON.stringify(rows, null, 1));
await b.close();
