// 示意图截图：node docs/ui/v2/mock_bag_v2/shoot.mjs <page.html> <out.png> [宽] [高] [fullPage]
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const [page, out, w = 1280, h = 720, full] = process.argv.slice(2);
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on("console", (m) => console.log("[page]", m.text()));
p.on("pageerror", (e) => console.log("[err]", e.message));
await p.goto(pathToFileURL(path.resolve(page)).href);
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => console.log("no __ready"));
await p.waitForTimeout(300);
await p.screenshot({ path: out, fullPage: !!full });
await b.close();
console.log("ok", out);
