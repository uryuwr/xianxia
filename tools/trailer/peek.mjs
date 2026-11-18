// 检查用：从视频里每隔 step 秒抽一帧拼成一张图。node tools/trailer/peek.mjs <video> <out.png> [step=0.5] [cols=4] [width=480]
import { spawnSync } from "node:child_process";
import { ffmpegPath } from "./lib.mjs";
const [inp, out, step = "0.5", cols = "4", w = "480"] = process.argv.slice(2);
const probe = spawnSync(ffmpegPath(), ["-hide_banner", "-i", inp], { encoding: "utf8" }).stderr;
const m = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
const dur = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 10;
const n = Math.max(1, Math.floor(dur / +step));
const rows = Math.ceil(n / +cols);
const r = spawnSync(ffmpegPath(), ["-y", "-hide_banner", "-loglevel", "error", "-i", inp, "-vf", `fps=1/${step},scale=${w}:-1,drawtext=text='%{pts}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.5,tile=${cols}x${rows}`, "-frames:v", "1", out], { encoding: "utf8" });
if (r.status) console.log(r.stderr);
console.log(out, dur.toFixed(2) + "s", n + " frames");
