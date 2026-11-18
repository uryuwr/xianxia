// 程序脸谱 v1 截图：node docs/art/程序脸谱_v1/shoot.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 1340, height: 1080 } });
p.on("pageerror", (e) => console.log("[err]", e.message));
await p.goto(pathToFileURL(path.join(DIR, "index.html")).href);
await p.waitForTimeout(400);
await p.screenshot({ path: path.join(DIR, "ink.png"), fullPage: true });
await p.click("button[data-p=opera]"); await p.waitForTimeout(200);
await p.screenshot({ path: path.join(DIR, "opera.png"), fullPage: true });
await b.close(); console.log("ok");
