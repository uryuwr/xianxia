// 验证分享包：用 file:// 直接打开 release/墨途_v1.html，确认能进开始界面、新卷进教学局、模型加载成功、无报错。
// 用法：node tools/check_pack.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const file = pathToFileURL(path.join(ROOT, "release", "墨途_v1.html")).href;
const browser = await chromium.launch({ executablePath: exe, headless: !0, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 300)));
const ok = (c, m, x) => console.log((c ? "PASS " : "FAIL ") + m + (x !== undefined ? " " + JSON.stringify(x) : ""));
await page.goto(file + "?scene=title");
ok(await page.waitForFunction(() => window.__ready === !0 && window.__game && __game.flow && __game.flow.name === "title", null, { timeout: 90000 }).then(() => !0, () => !1), "file:// boots to title");
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(ROOT, "work", "shots", "pack_title.png") });
await page.evaluate(() => (__game.flow.newGame(9), __game.flow.go("run", { region: "tutorial" })));
ok(await page.waitForFunction(() => __game.run && __game.run.state === "play", null, { timeout: 60000 }).then(() => !0, () => !1), "tutorial run starts");
await page.waitForTimeout(3000);
const st = await page.evaluate(() => ({ hero: __game.player.source, enemies: __game.enemies && __game.enemies.ready }));
ok(st.hero === "hero.glb", "hero model loaded from embedded data", st);
await page.screenshot({ path: path.join(ROOT, "work", "shots", "pack_run.png") });
ok(errs.length === 0, "no page errors", errs.slice(0, 5));
await page.evaluate(() => localStorage.removeItem("moxian.save.9"));
await browser.close();
