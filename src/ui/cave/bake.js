// 洞府界面的位图（模块 C）：水墨套件里用 SVG 滤镜（feTurbulence）画的纸纹、墨晕、立绘，第一次显示时要在主线程上跑滤镜，
// 首次进洞府会卡 100–450ms。现在这些图由 tools/cave_art.mjs 离线栅格成 PNG（src/ui/cave/art/），运行时只做：
//   bakeInkTextures()   把 :root 上 --ink-tex-paper / fiber / cloud、--ink-wash-* 指向 PNG（全局生效，其他界面也受益），并后台解码
//   bakeArt(map)        立绘 / 插画 → 同名 PNG 地址（后台解码）
// 解码用 img.decode()，在浏览器的解码线程里做，不占主线程。
const PNG = import.meta.glob("./art/*.png", { query: "?url", import: "default", eager: !0 });
const png = (name) => PNG["./art/" + name] || null;
const VARS = ["--ink-tex-paper", "--ink-tex-fiber", "--ink-tex-cloud", "--ink-wash-1", "--ink-wash-2", "--ink-wash-round"];

function decode(url) {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  return img.decode().catch(() => {});
}

let texDone = null;
export function bakeInkTextures() {
  if (texDone) return texDone;
  const root = document.documentElement;
  const jobs = [];
  for (const v of VARS) {
    const url = png(v.replace(/^--ink-/, "") + ".png");
    if (!url) continue;
    root.style.setProperty(v, `url("${url}")`);
    jobs.push(decode(url));
  }
  texDone = Promise.all(jobs);
  return texDone;
}

export async function bakeArt(map) {
  await Promise.all(Object.values(map).filter(Boolean).map(decode));
  return map;
}
