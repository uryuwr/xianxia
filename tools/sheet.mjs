// 把多张截图拼成对比图：node tools/sheet.mjs name1 name2 ...
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";
const names = process.argv.slice(2);
const exe = path.join(process.env.LOCALAPPDATA, "ms-playwright/chromium-1243/chrome-win64/chrome.exe");
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 1280, height: 360 * Math.ceil(names.length / 2) } });
const imgs = names.map((n) => "data:image/png;base64," + fs.readFileSync("work/shots/" + n + ".png").toString("base64"));
await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:640px 640px;background:#000">${imgs.map((s, i) => `<div style="position:relative"><img src="${s}" width=640><b style="position:absolute;left:6px;top:4px;color:#ff0;background:rgba(0,0,0,.65);padding:1px 6px;font:20px sans-serif">${names[i]}</b></div>`).join("")}</body>`);
await p.screenshot({ path: "work/shots/_sheet.png" });
await b.close();
