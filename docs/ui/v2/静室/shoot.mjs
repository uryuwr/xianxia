// 静室草图截图：node docs/ui/v2/静室/shoot.mjs <页面.html[#hash]> <输出.png> [点击选择器|…] [悬停选择器] [宽] [高]
// 例：node docs/ui/v2/静室/shoot.mjs "docs/ui/v2/静室/a_xingjuan.html#stat=atk" docs/ui/v2/png/静室_A.png
// 点击选择器里写 "drag:源>目标" 表示拖拽（例 drag:[data-src-id=frost]>[data-slot-kind=spell][data-slot-i="2"]）。
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
const [page, out, clicks = "", hover = "", w = 1280, h = 720] = process.argv.slice(2);
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1243", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on("pageerror", (e) => console.log("[err]", e.message));
p.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));
const [file, hash] = page.split("#");
await p.goto(pathToFileURL(path.resolve(file)).href + (hash ? "#" + hash : ""));
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => console.log("no __ready"));
await p.waitForTimeout(200);
for (const s of clicks.split("|").filter(Boolean)) {
  if (s.startsWith("drag:")) {
    const [a, z] = s.slice(5).split(">");
    const A = await p.locator(a).first().boundingBox(), Z = await p.locator(z).first().boundingBox();
    await p.mouse.move(A.x + A.width / 2, A.y + A.height / 2);
    await p.mouse.down();
    await p.mouse.move(A.x + 30, A.y + 30, { steps: 4 });
    await p.mouse.move(Z.x + Z.width / 2, Z.y + Z.height / 2, { steps: 8 });
    await p.mouse.up();
  } else await p.locator(s).first().click();
  await p.waitForTimeout(220);
}
if (hover) { await p.hover(hover); await p.waitForTimeout(250); } else await p.mouse.move(1270, 715);
await p.waitForTimeout(300);
await p.screenshot({ path: out });
await b.close();
console.log("ok", out);
