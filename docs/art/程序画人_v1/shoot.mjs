// 程序画人 v1 截图：node docs/art/程序画人_v1/shoot.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 1320, height: 1050 } });
p.on("pageerror", (e) => console.log("[err]", e.message));
await p.goto(pathToFileURL(path.join(DIR, "index.html")).href);
await p.waitForTimeout(500);
await p.locator("#cv").screenshot({ path: path.join(DIR, "full.png") });
await p.click("button[data-m=line]"); await p.waitForTimeout(200);
await p.locator("#cv").screenshot({ path: path.join(DIR, "line.png") });
await b.close(); console.log("ok");
