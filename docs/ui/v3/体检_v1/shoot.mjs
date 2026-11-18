// 体检_v1 截图 + 实测对比度（一个浏览器跑完全部，用完即关；占 tools/run.mjs 同一把浏览器锁 work/.runslots/0.lock）
//   node docs/ui/v3/体检_v1/shoot.mjs            → png/*.png + work/_tj_m/*（对比度原始裁片）
//   node docs/ui/v3/体检_v1/shoot.mjs only=a_    → 只跑名字含 a_ 的任务
// 对比度做法（按最差背景量，XAG 101）：对每个 [data-m] 元素截三张同位裁片——
//   A 前景隐藏（文字 color:transparent，纸色描边仍在；条 visibility:hidden）= 字 / 条底下真正的背景；
//   B 前景染成品红、去描边 = 字形 / 条形遮罩；C 原样。再由 measure_dom.py 在遮罩核心像素上算 C 对 A 的对比度，取 P10 / 中位数。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { chromium } from "file:///D:/workspace/html/xianxia/node_modules/playwright-core/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const OUT = path.join(HERE, "png");
const MDIR = path.join(ROOT, "work", "_tj_m");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(MDIR, { recursive: true });
const only = (process.argv.find((a) => a.startsWith("only=")) || "").slice(5);

// 浏览器锁（与 tools/run.mjs 同一机制：pid 文件，持有者不在就清掉）
const slot = path.join(ROOT, "work", ".runslots", "0.lock");
fs.mkdirSync(path.dirname(slot), { recursive: true });
const alive = (pid) => { try { return process.kill(pid, 0), true; } catch (e) { return e.code === "EPERM"; } };
for (let said = false; ; ) {
  try { fs.writeFileSync(slot, String(process.pid), { flag: "wx" }); break; } catch {
    const pid = Number(fs.readFileSync(slot, "utf8").trim() || 0);
    if (pid && !alive(pid)) { fs.rmSync(slot, { force: true }); continue; }
    if (!said) (said = true), console.log("[shoot] 浏览器锁被占用，排队…");
    await new Promise((r) => setTimeout(r, 2000));
  }
}
const free = () => { try { if (fs.readFileSync(slot, "utf8").trim() === String(process.pid)) fs.rmSync(slot, { force: true }); } catch {} };
process.on("exit", free);

// 任务：[名字, 页面, hash, 宽, 高, 是否量对比度]
const J = [];
for (const [f, d] of [["now", "now"], ["a_zhumo", "a"], ["b_yinji", "b"], ["c_moxue", "c"]]) {
  const page = d === "now" ? "a_zhumo.html" : f + ".html";
  for (const bg of ["old", "B", "C"]) J.push([`vt_${d}_${bg}`, page, `d=${d}&bg=${bg}&st=hit&g=now&shot=1`, 1280, 720, true]);
  J.push([`vt_${d}_B_night_low`, page, `d=${d}&bg=B&st=low&g=now&night=1&shot=1`, 1280, 720, true]);
}
for (const g of ["now", "wash", "band"]) for (const bg of ["old", "B", "C"]) J.push([`g_${g}_${bg}`, "d_dichen.html", `d=a&g=${g}&bg=${bg}&st=hit&shot=1`, 1280, 720, true]);
J.push(["g_wash_B_night", "d_dichen.html", "d=a&g=wash&bg=B&st=hit&night=1&shot=1", 1280, 720, true]);
J.push(["g_now_B_night", "d_dichen.html", "d=a&g=now&bg=B&st=hit&night=1&shot=1", 1280, 720, true]);
J.push(["world_compare", "e_shijie.html", "shot=1", 1280, 720, true]);
J.push(["index", "index.html", "shot=1", 1900, 0, false]);

const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--allow-file-access-from-files"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("[err]", e.message));
  const meta = {};
  for (const [name, file, hash, w, h, measure] of J) {
    if (only && !name.includes(only)) continue;
    await p.setViewportSize({ width: w, height: h || 720 });
    const url = pathToFileURL(path.join(HERE, file)).href + "#" + hash;
    await p.goto("about:blank");
    await p.goto(url);
    await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => console.log("no __ready", name));
    await p.addStyleTag({ content: "*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;transition:none!important}" });
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, name + ".png"), fullPage: !h });
    console.log("png", name);
    if (!measure) continue;
    await p.addStyleTag({ content: `
      .__mA,.__mA *{color:transparent!important}
      .__mAb{visibility:hidden!important}
      .__mB,.__mB *{color:#ff00ff!important;text-shadow:none!important}
      .__mBb{background:#ff00ff!important;opacity:1!important;animation:none!important}
      path.__mBb{stroke:#ff00ff!important;fill:none!important;stroke-opacity:1!important}` });
    const els = await p.$$("[data-m]");
    const list = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const info = await el.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { name: e.dataset.m, kind: e.dataset.k || "text", x: r.x, y: r.y, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(e).fontSize), vis: r.width > 0 && r.height > 0 };
      });
      if (!info.vis) continue;
      const clip = { x: Math.max(0, Math.floor(info.x) - 2), y: Math.max(0, Math.floor(info.y) - 2), width: Math.ceil(info.w) + 4, height: Math.ceil(info.h) + 4 };
      clip.width = Math.min(clip.width, w - clip.x); clip.height = Math.min(clip.height, (h || 720) - clip.y);
      const ca = info.kind === "bar" ? "__mAb" : "__mA", cb = info.kind === "bar" ? "__mBb" : "__mB";
      const base = path.join(MDIR, `${name}_${i}`);
      await p.screenshot({ path: base + "_C.png", clip });
      // 条：A 把整条（槽 + 余迹 + 填充）都藏掉，量"填充 vs 条外的墨晕底"；字：只藏字形，纸色描边留着
      const hideA = (e, c) => (c === "__mAb" ? e.closest(".bar,.ib,.mb,.b2,.bg") || e : e).classList.toggle(c);
      await el.evaluate(hideA, ca);
      await p.screenshot({ path: base + "_A.png", clip });
      await el.evaluate(hideA, ca);
      await el.evaluate((e, c) => e.classList.add(c), cb);
      await p.screenshot({ path: base + "_B.png", clip });
      await el.evaluate((e, c) => e.classList.remove(c), cb);
      list.push({ ...info, file: `${name}_${i}` });
    }
    meta[name] = list;
  }
  if (!only) fs.writeFileSync(path.join(MDIR, "meta.json"), JSON.stringify(meta, null, 1));
  else { const f = path.join(MDIR, "meta.json"); const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; fs.writeFileSync(f, JSON.stringify({ ...old, ...meta }, null, 1)); }
} finally {
  await b.close();
  free();
}
console.log("done");
