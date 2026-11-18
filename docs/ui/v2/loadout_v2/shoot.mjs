// 示意图截图：node docs/ui/v2/loadout_v2/shoot.mjs <page.html[#hash]> <out.png> [宽] [高] [悬停选择器] [点击选择器]
// 例：node docs/ui/v2/loadout_v2/shoot.mjs docs/ui/v2/loadout_v2/a_xingqian.html docs/ui/v2/png/loadout_v2_a_xingqian.png
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const [page, out, w = 1280, h = 720, hoverSel, clickSel] = process.argv.slice(2);
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on("console", (m) => console.log("[page]", m.text()));
p.on("pageerror", (e) => console.log("[err]", e.message));
const [file, hash] = page.split("#");
await p.goto(pathToFileURL(path.resolve(file)).href + (hash ? "#" + hash : ""));
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => console.log("no __ready"));
if (clickSel) for (const s of clickSel.split("|")) { await p.click(s); await p.waitForTimeout(200); }
if (hoverSel) { await p.hover(hoverSel); await p.waitForTimeout(250); }
await p.waitForTimeout(300);
await p.screenshot({ path: out });
await b.close();
console.log("ok", out);
