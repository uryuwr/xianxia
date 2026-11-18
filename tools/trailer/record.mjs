// 《墨途》宣传片录制脚本：逐镜头打开游戏、用调试接口布置场景、用真实键鼠驱动操作，按虚拟时钟逐帧截图编码成片段。
// 用法：node tools/trailer/record.mjs [镜头名 ...]（不带参数 = 全部镜头）
// 输出：work/video/clips/<镜头>.mp4 + <镜头>.json（帧数、关键时间点），合成见 tools/trailer/build.mjs
import fs from "node:fs";
import path from "node:path";
import { launch, Rec, VIDEO, FPS } from "./lib.mjs";
// 镜头表：默认 shots.mjs；TRAILER_TABLE=qingya → shots_qingya.mjs（build.mjs --edit=qingya 自动带上）
const { SHOTS } = await import(process.env.TRAILER_TABLE ? `./shots_${process.env.TRAILER_TABLE}.mjs` : "./shots.mjs");

const CLIPS = path.join(VIDEO, "clips");
fs.mkdirSync(CLIPS, { recursive: !0 });
const only = process.argv.slice(2);
const list = SHOTS.filter((s) => !only.length || only.includes(s.name));
if (!list.length) {
  console.log("可选镜头：", SHOTS.map((s) => s.name).join(" "));
  process.exit(1);
}
const S = await launch({});
let failed = 0;
for (const shot of list) {
  const t0 = Date.now();
  for (let attempt = 1; attempt <= (shot.retries || 2); attempt++) {
    const tab = await S.open(shot.open || {});
    const R = new Rec(S, tab, CLIPS);
    R.marks = {};
    R.mark = (k) => (R.marks[k] = +((R.enc ? R.enc.n : 0) / FPS).toFixed(3));
    try {
      // 看门狗：单个镜头超过 shot.timeout（默认 300 秒）算失败重试，避免某一步卡死整条流水线
      let timer;
      await Promise.race([shot.run(R), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error("镜头超时")), (shot.timeout || 300) * 1000)))]);
      clearTimeout(timer);
      await R.cut();
      const m = R.manifest[R.manifest.length - 1] || {};
      fs.writeFileSync(path.join(CLIPS, shot.name + ".json"), JSON.stringify({ ...m, marks: R.marks, recordedAt: new Date().toISOString() }, null, 2));
      const errs = await R.ev(() => window.__errors || []).catch(() => []);
      if (errs.length) console.log(`[trailer] ${shot.name} 页面报错：`, JSON.stringify(errs).slice(0, 800));
      console.log(`[trailer] ✓ ${shot.name}（${((Date.now() - t0) / 1000).toFixed(0)}s）`);
      await tab.close();
      break;
    } catch (e) {
      console.log(`[trailer] ✗ ${shot.name} 第 ${attempt} 次失败：`, e.stack || e);
      try {
        await R.png(path.join(CLIPS, shot.name + "_fail.png"));
      } catch {}
      if (R.enc) (R.enc.ff.stdin.end(), await R.enc.done, (R.enc = null));
      await tab.close();
      if (attempt === (shot.retries || 2)) failed++;
    }
  }
}
if (S.logs.length) console.log(S.logs.slice(0, 30).join("\n"));
await S.close();
process.exit(failed ? 1 : 0);
