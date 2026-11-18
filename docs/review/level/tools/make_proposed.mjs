// 生成定稿关卡数据：读 src/data/levels/<id>.js（关卡开发的最新版）→ 套用 tools/overrides.mjs → 写 proposed/<id>.js
// 用法：node docs/review/level/tools/make_proposed.mjs
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { OVERRIDES } from "./overrides.mjs";

// 紧凑格式：数字数组、短对象写在一行，其余分行缩进（和手写的关卡文件风格接近）
const NL = "\n";
const key = (k) => (/^[A-Za-z_]\w*$/.test(k) ? k : JSON.stringify(k));
function inline(v) {
  if (Array.isArray(v)) return "[" + v.map(inline).join(", ") + "]";
  if (v && typeof v === "object") return "{ " + Object.entries(v).map(([k, x]) => key(k) + ": " + inline(x)).join(", ") + " }";
  return v === true ? "!0" : v === false ? "!1" : JSON.stringify(v);
}
const numeric = (v) => Array.isArray(v) && v.every((x) => typeof x === "number" || (Array.isArray(x) && x.every((y) => typeof y === "number")));
function fmt(v, ind) {
  const one = inline(v);
  if (one.length + ind.length < 150 || numeric(v)) return one;
  const n = ind + "  ";
  if (Array.isArray(v)) return "[" + NL + v.map((x) => n + fmt(x, n)).join("," + NL) + "," + NL + ind + "]";
  return "{" + NL + Object.entries(v).map(([k, x]) => n + key(k) + ": " + fmt(x, n)).join("," + NL) + "," + NL + ind + "}";
}

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const root = path.resolve(here, "../../../..");
for (const id of Object.keys(OVERRIDES)) {
  const src = (await import(pathToFileURL(path.join(root, "src/data/levels", id + ".js")).href)).default;
  const d = structuredClone(src);
  OVERRIDES[id](d);
  const head = `// 关卡评审定稿（自动生成，勿手改）：src/data/levels/${id}.js + docs/review/level/tools/overrides.mjs。` + NL + `// 可直接替换 src/data/levels/${id}.js；前提是 heightfield 已打硬崖补丁（proposed/heightfield_hardCliffs.diff）。改了什么、为什么，见 overrides.mjs 的注释。` + NL;
  const body = fmt(d, "").replace(/palette: \{[^}]*\}/, (m) => m.replace(/\d{5,}/g, (n) => "0x" + Number(n).toString(16).padStart(6, "0")));
  writeFileSync(path.join(here, "..", "proposed", id + ".js"), head + "export default " + body + ";" + NL);
  console.log("proposed/" + id + ".js");
}
