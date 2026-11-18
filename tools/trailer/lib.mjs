// 录制工具库：起 Vite 服务器 + Chromium（注入虚拟时钟），逐帧推进游戏、截图并直接管道编码成片段。
//   const S = await launch({ w, h });  S.page / S.cdp / S.url / S.close()
//   const R = new Rec(S, outDir);      R.go(query) 打开游戏；R.clip(name) 开始片段；R.frames(n) 推进并录 n 帧；R.cut() 结束片段
//   输入：R.key / R.down / R.up / R.mouseTo / R.click / R.hold —— 全部走 page.keyboard / page.mouse 的真实事件，按帧对齐
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const VIDEO = path.join(ROOT, "work", "video");
export const FPS = 30;

export function ffmpegPath() {
  const env = process.env.FFMPEG;
  if (env && fs.existsSync(env)) return env;
  const dir = path.join(VIDEO, "bin", "pydeps", "imageio_ffmpeg", "binaries");
  if (fs.existsSync(dir)) {
    const f = fs.readdirSync(dir).find((x) => /^ffmpeg.*\.exe$/i.test(x));
    if (f) return path.join(dir, f);
  }
  const f2 = path.join(VIDEO, "bin", "ffmpeg.exe");
  if (fs.existsSync(f2)) return f2;
  throw new Error("找不到 ffmpeg：先运行 node tools/trailer/build.mjs setup（pip 装 imageio-ffmpeg 到 work/video/bin/pydeps）");
}

// 画面按 1280×720 的界面基准排版（UI 风格指南的基准尺寸），设备像素比 1.5 → 截图 1920×1080，界面与 3D 都是原生清晰度
export async function launch({ w = 1280, h = 720, dpr = 1.5, headed = !!process.env.HEADED } = {}) {
  const port = 5200 + Math.floor(Math.random() * 600);
  const server = await createServer({ root: ROOT, logLevel: "error", server: { port, strictPort: !1, hmr: !1 } });
  await server.listen();
  const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
  const browser = await chromium.launch({
    executablePath: exe,
    headless: !headed,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", `--window-size=${Math.round(w * dpr)},${Math.round(h * dpr) + 140}`],
  });
  const base = server.resolvedUrls.local[0];
  const logs = [];
  // 每个镜头一个独立浏览器上下文（存档 / 设置互不影响）。settings 写进 moxian.settings（画质"高"等）
  const open = async ({ settings = {}, storage = {} } = {}) => {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await context.addInitScript(([st, more]) => {
      if (sessionStorage.getItem("__trailerInit")) return;
      sessionStorage.setItem("__trailerInit", "1");
      localStorage.setItem("moxian.settings", JSON.stringify({ quality: "high", ...st }));
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }, [settings, storage]);
    await context.addInitScript({ path: path.join(ROOT, "tools", "trailer", "vt.js") });
    const page = await context.newPage();
    await page.routeWebSocket(/./, () => {}); // 屏蔽 HMR：别的组改代码时不会整页刷新
    page.on("console", (m) => {
      const t = m.text();
      if (/X3595|Program Info Log/.test(t)) return;
      if (m.type() === "error" || /^\[(vt|scenario|trailer)/.test(t)) logs.push(`[${m.type()}] ${t}`.slice(0, 400));
    });
    page.on("pageerror", (e) => logs.push("[pageerror] " + String(e.stack || e).slice(0, 600)));
    const cdp = await context.newCDPSession(page);
    return { page, cdp, context, close: () => context.close().catch(() => {}) };
  };
  return {
    server, browser, base, logs, w, h, dpr, open,
    async close() {
      await browser.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Rec {
  constructor(S, tab, outDir) {
    this.S = S;
    this.tab = tab;
    this.page = tab.page;
    this.cdp = tab.cdp;
    this.out = outDir;
    fs.mkdirSync(outDir, { recursive: !0 });
    this.enc = null;
    this.mouse = { x: S.w / 2, y: S.h / 2 };
    this.dt = 1000 / FPS; // 每帧推进的游戏时间（慢动作时调小）
    this.total = 0;
    this.manifest = [];
  }
  ev(fn, arg) {
    return this.page.evaluate(fn, arg);
  }
  async go(query, { ready = () => window.__ready === !0 } = {}) {
    await this.page.goto(this.S.base + "?" + query);
    await this.page.waitForFunction(() => window.__ready === !0 || window.__fatal, null, { timeout: 180000 });
    await this.page.waitForFunction(ready, null, { timeout: 180000, polling: 200 });
  }
  // 实时等待（实时模式下用，例如等加载）
  async real(ms) {
    await this.ev(() => window.__vt.end());
    await this.page.waitForTimeout(ms);
  }
  async until(fn, arg, { timeout = 60000 } = {}) {
    await this.ev(() => window.__vt.end());
    await this.page.waitForFunction(fn, arg, { timeout, polling: 100 });
  }
  async begin() {
    await this.ev(() => window.__vt.begin());
  }
  // 不录制地推进 n 帧（场景布置、跳过无聊段落）
  async skip(n, dt = this.dt) {
    await this.ev(([n, dt]) => window.__vt.skip(n, dt), [n, dt]);
  }
  // ---------- 片段 ----------
  clip(name, { note = "" } = {}) {
    if (this.enc) throw new Error("上一个片段还没结束");
    const file = path.join(this.out, name + ".mp4");
    const tmp = path.join(this.out, name + ".part.mp4"); // 先写临时文件，结束后改名：别人读旧片段时不会读到半截
    const ff = spawn(ffmpegPath(), ["-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", String(FPS), "-movflags", "+faststart", tmp], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((r) => ff.on("close", r));
    this.enc = { ff, done, file, tmp, name, n: 0, note };
    console.log(`[trailer] ▶ ${name}`);
    return this;
  }
  async cut() {
    const e = this.enc;
    if (!e) return;
    e.ff.stdin.end();
    await e.done;
    // 改名；旧文件正被别的程序读着（Windows 锁文件）时重试几次，还不行就另存一个带时间戳的版本，清单指向新文件
    let ok = !1;
    for (let i = 0; i < 8 && !ok; i++) {
      try {
        fs.renameSync(e.tmp, e.file);
        ok = !0;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!ok) {
      const alt = path.join(this.out, `${e.name}.${Date.now().toString(36)}.mp4`);
      fs.renameSync(e.tmp, alt);
      console.log(`[trailer] ${e.name}.mp4 被占用，新片段另存为 ${path.basename(alt)}`);
      e.file = alt;
    }
    this.enc = null;
    this.total += e.n;
    this.manifest.push({ name: e.name, file: path.basename(e.file), frames: e.n, sec: +(e.n / FPS).toFixed(2), note: e.note });
    console.log(`[trailer] ■ ${e.name} ${e.n} 帧 ${(e.n / FPS).toFixed(1)}s`);
  }
  async shot() {
    // 按设备像素截（1280×720 × 1.5 = 1920×1080）
    const S = this.S;
    const r = await this.cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 94, optimizeForSpeed: !0, clip: { x: 0, y: 0, width: S.w, height: S.h, scale: S.dpr } });
    return Buffer.from(r.data, "base64");
  }
  // 推进一帧并（片段进行中时）截图
  async frame(each) {
    await this.ev((dt) => window.__vt.step(dt), this.dt);
    if (each) await each();
    if (this.enc) {
      const buf = await this.shot();
      if (!this.enc.ff.stdin.write(buf)) await new Promise((r) => this.enc.ff.stdin.once("drain", r));
      this.enc.n++;
    }
  }
  async frames(n, each) {
    for (let i = 0; i < n; i++) await this.frame(each && (() => each(i)));
  }
  sec(s, each) {
    return this.frames(Math.round(s * FPS), each);
  }
  // 截一张静帧 PNG（检查用）
  async png(file) {
    await this.page.screenshot({ path: file });
  }
  // ---------- 输入（真实事件）----------
  async down(code) {
    await this.page.keyboard.down(code);
  }
  async up(code) {
    await this.page.keyboard.up(code);
  }
  // 按一下：按下 hold 帧后松开
  async key(code, hold = 2) {
    await this.page.keyboard.down(code);
    await this.frames(hold);
    await this.page.keyboard.up(code);
  }
  async moveRaw(x, y) {
    this.mouse = { x, y };
    await this.page.mouse.move(x, y);
  }
  // 鼠标在 frames 帧内平滑移到 (x, y)（每帧一个 mousemove，像真人拖动）
  async mouseTo(x, y, frames = 8) {
    const a = { ...this.mouse };
    for (let i = 1; i <= frames; i++) {
      const k = ease(i / frames);
      await this.moveRaw(a.x + (x - a.x) * k, a.y + (y - a.y) * k);
      await this.frame();
    }
  }
  async click(x, y, { move = 8, hold = 2, button = "left" } = {}) {
    if (x != null) await this.mouseTo(x, y, move);
    await this.page.mouse.down({ button });
    await this.frames(hold);
    await this.page.mouse.up({ button });
  }
  async mdown(button = "left") {
    await this.page.mouse.down({ button });
  }
  async mup(button = "left") {
    await this.page.mouse.up({ button });
  }
  // 世界坐标 → 屏幕坐标（用游戏镜头投影）
  async toScreen(x, y, z) {
    return this.ev(([x, y, z]) => {
      const g = window.__game, v = new g.THREE.Vector3(x, y, z).project(g.camera);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
    }, [x, y, z]);
  }
  // 元素中心的屏幕坐标
  async boxOf(sel) {
    const b = await this.page.locator(sel).first().boundingBox();
    return b && { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
  }
  async clickSel(sel, opts = {}) {
    const p = await this.boxOf(sel);
    if (!p) throw new Error("找不到元素 " + sel);
    await this.click(p.x, p.y, opts);
  }
  writeManifest(file) {
    fs.writeFileSync(file, JSON.stringify(this.manifest, null, 2));
  }
}
