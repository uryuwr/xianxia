// 浏览器验证工具：启动 Vite 开发服务器，用 Playwright 自带的 Chromium 打开游戏，执行场景脚本，收集报错并截图。
// 用法：node tools/run.mjs <scenario> [query]
//   scenario: tools/scenarios/<name>.mjs，导出 default async (page, ctx)
//   截图保存在 work/shots/<scenario>_<name>.png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [scen = "smoke", query = ""] = process.argv.slice(2);
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const shots = path.join(ROOT, "work", "shots");
fs.mkdirSync(shots, { recursive: true });

// 主 agent 在实现全部收工后统一跑测试；默认只运行一个浏览器，避免争抢 CPU / GPU。
// 槽位 = work/.runslots/<i>.lock（内容为 pid）；持有者进程已不在就视为空槽。显式 RUN_MAX 可覆盖。
const SLOT_MAX = Number(process.env.RUN_MAX ?? 1);
const slotDir = path.join(ROOT, "work", ".runslots");
let slotFile = null;
const alive = (pid) => {
  try {
    return process.kill(pid, 0), !0;
  } catch (e) {
    return e.code === "EPERM";
  }
};
if (SLOT_MAX > 0) {
  fs.mkdirSync(slotDir, { recursive: true });
  const tw = Date.now();
  let said = !1;
  for (;;) {
    for (let i = 0; i < SLOT_MAX && !slotFile; i++) {
      const f = path.join(slotDir, `${i}.lock`);
      try {
        fs.writeFileSync(f, String(process.pid), { flag: "wx" });
        slotFile = f;
      } catch {
        const pid = Number(fs.readFileSync(f, "utf8").trim() || 0);
        if (pid && !alive(pid)) fs.rmSync(f, { force: !0 });
      }
    }
    if (slotFile) break;
    if (!said) (said = !0), console.log(`[run] 已有 ${SLOT_MAX} 个测试在跑，排队等待…`);
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
  }
  if (said) console.log(`[run] 排队 ${((Date.now() - tw) / 1000).toFixed(0)}s 后开始`);
  const free = () => {
    try {
      if (slotFile && fs.readFileSync(slotFile, "utf8").trim() === String(process.pid)) fs.rmSync(slotFile, { force: !0 });
    } catch {}
    slotFile = null;
  };
  process.on("exit", free);
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => (free(), process.exit(130)));
}

// 每次用独立端口，避免占用玩家的预览服务
const port = 5200 + Math.floor(Math.random() * 600);
const server = await createServer({ root: ROOT, logLevel: "error", server: { port, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0] + (query ? "?" + query : "");

const browser = await chromium.launch({
  executablePath: exe,
  headless: !process.env.HEADED,
  // IGPU=1：强制用集成显卡（双显卡机器上模拟"普通集显笔记本"，性能测试用）
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", ...(process.env.IGPU ? ["--force_low_power_gpu"] : [])],
});
// DPR=1.25：模拟系统缩放（devicePixelRatio），性能测试用
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) }, deviceScaleFactor: Number(process.env.DPR || 1) });
const logs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/X3595|Program Info Log/.test(t)) return;
  if (m.type() === "error" || m.type() === "warning" || /^\[/.test(t)) logs.push(`[${m.type()}] ${t}`.slice(0, 600));
});
page.on("pageerror", (e) => logs.push("[pageerror] " + String(e.stack || e).slice(0, 800)));

let code = 0;
// 场景用 PASS / FAIL 或 ✔ / ✘ 输出检查项：失败检查必须反映到退出码。
let fails = 0;
const _log = console.log;
console.log = (...a) => (typeof a[0] === "string" && /^(FAIL |✘)/.test(a[0]) && fails++, _log(...a));
try {
  const t0 = Date.now();
  // 屏蔽 Vite 热更新连接：其他模块并行改文件时不会整页刷新、打断测试（NOHMR=0 可关闭）
  if (process.env.NOHMR !== "0") await page.routeWebSocket(/./, () => {});
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true || window.__fatal, null, { timeout: 180000 });
  const ready = await page.evaluate(() => ({ fatal: window.__fatal || null, errors: window.__errors }));
  console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(ready));
  if (ready.fatal) throw new Error(`游戏启动失败：${ready.fatal}`);
  const ctx = {
    shot: async (name, opts = {}) => {
      const f = path.join(shots, `${scen}_${name}.png`);
      await page.screenshot({ path: f, ...opts });
      console.log("shot", f);
      return f;
    },
    wait: (ms) => page.waitForTimeout(ms),
    ev: (fn, arg) => page.evaluate(fn, arg),
    log: (...a) => console.log(...a),
  };
  const mod = await import(pathToFileURL(path.join(ROOT, "tools", "scenarios", scen + ".mjs")).href);
  await mod.default(page, ctx);
} catch (e) {
  console.log("[scenario error]", e.stack || e);
  code = 1;
}
const errors = await page.evaluate(() => window.__errors || []).catch(() => null);
console.log("errors:", JSON.stringify(errors).slice(0, 2000));
console.log(logs.slice(0, 40).join("\n"));
if (errors === null || errors.length || logs.some((s) => s.startsWith("[pageerror]"))) {
  console.log("FAIL 页面存在运行错误或已失联");
  code = 1;
}
if (fails) (console.log(`${fails} 项 FAIL`), (code = code || 1));
await browser.close();
await server.close();
process.exit(code);
