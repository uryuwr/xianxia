// 天机镜"战报"应用（UI 设计，boss_青牙_v2 §6 成长 / §11.3 镜头 7）：读 profile.stats.bossLog[id]（流程组 bossflow.js 写入）。
//   镜中屏：首斩 / 最好一次、挑战 · 斩 · 撤 · 陨、最快、处决次数、近十次（最新在上，每条一笔"削去几成"）
//   镜外浮签：近十次的成长图（每次一笔竖墨，高 = 削去的气血；斩下的那次满格 + 朱"斩"；50% 处朱线"二" = 转阶段）
// 缺的字段一律"—"（天机镜约定）。由 src/ui/cave/mirror_v2.js 的 boss 应用调用：bossReport(p, S) / bossSide(p, S)。
import "./boss_report.css";
import { PROGRESSION } from "../../data/progression.js";
import { BOSS_TEXT } from "./boss_text.js";

const NA = "—";
const CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
export const REPORT_BOSSES = ["qingya", "bilin"];
const NAME = { qingya: "青牙", bilin: "碧鳞" };
function realmName(k) {
  if (!k) return NA;
  const [s, l] = String(k).split(":").map(Number);
  if (s === 0) return "凡人";
  return ((PROGRESSION.stages[s] && PROGRESSION.stages[s].name) || "") + (s === 1 ? (CN[l] || l) + "层" : CN[l] === "一" ? "" : (CN[l] || l) + "层");
}
function realmShort(k) {
  if (!k) return NA;
  const [s, l] = String(k).split(":").map(Number);
  if (s === 0) return "凡人";
  return s === 1 ? "练" + (CN[l] || l) : realmName(k);
}
const mmss = (s) => (s == null ? NA : `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`);
const pct = (hpLeft) => Math.round(Math.max(0, Math.min(1, hpLeft)) * 100);
const RES = { kill: ["斩", ""], retreat: ["撤", "ink"], death: ["陨", "ink dim"], leave: ["离", "ink dim"] };
const resSeal = (r) => {
  const [g, c] = RES[r] || ["—", "ink dim"];
  return `<span class="ink-seal ${c}" style="--s:17px">${g}</span>`;
};
// 削去的比例（0–1）：斩 = 1
const prog = (x) => (x.result === "kill" ? 1 : 1 - Math.max(0, Math.min(1, x.hpLeft ?? 1)));
const bar = (k, cls = "") => `<span class="bxr-bar ${cls}" style="--b:${k.toFixed(3)}"><i></i><u></u></span>`;

export function bossesWithLog(p) {
  const B = (p.stats && p.stats.bossLog) || {};
  return REPORT_BOSSES.filter((id) => B[id] && B[id].tries > 0);
}
export function logOf(p, id) {
  return (p.stats && p.stats.bossLog && p.stats.bossLog[id]) || null;
}
// 镜中屏
export function bossReport(p, S = {}) {
  const ids = bossesWithLog(p);
  const id = S.boss && ids.includes(S.boss) ? S.boss : ids[0] || "qingya";
  const L = logOf(p, id);
  const T = BOSS_TEXT[id] || { name: NAME[id] || id, title: "" };
  const tabs = ids.length > 1 ? `<div class="bxr-tabs">${ids.map((b) => `<button class="${b === id ? "on" : ""}" data-boss="${b}">${NAME[b] || b}</button>`).join("<i>·</i>")}</div>` : "";
  if (!L) return `${tabs}<div class="bxr"><div class="bxr-hero"><b class="nm">${T.name}</b><span class="tl">${T.title}</span></div><div class="bxr-empty">尚未交手。<br>狼谷在青岚山外北岭，狼骨门后。</div></div>`;
  const fk = L.firstKill, best = L.best, log = (L.log || []).slice().reverse();
  const v = (x) => (x == null ? NA : x);
  const head = fk
    ? `<div class="st"><span class="ink-seal" style="--s:20px">斩</span>首斩于<b>${realmName(fk.realm)}</b> · 第 ${v(fk.run)} 次出行 · 用时 ${mmss(fk.sec)}</div>`
    : `<div class="st">尚未斩 · 最好：${best ? `${best.phase >= 2 ? "二阶段" : "一阶段"} · 削至 <b>${pct(best.hpLeft)}%</b>` : NA}</div>`;
  const ex = L.execs || {};
  const rows = log.length
    ? log.map((x) => `<div class="bxr-row ${x.result === "kill" ? "kill" : ""}" title="第 ${v(x.run)} 次出行 · ${realmName(x.realm)} · ${x.result === "kill" ? "斩" : "削至 " + pct(x.hpLeft) + "%"} · ${mmss(x.sec)}">
        <span class="r">${v(x.run)}</span><span class="rl">${realmShort(x.realm)}</span>${resSeal(x.result)}${bar(prog(x), x.result === "kill" ? "kill" : "")}<span class="p">${x.result === "kill" ? "斩" : pct(x.hpLeft) + "%"}</span><span class="t">${mmss(x.sec)}</span></div>`).join("")
    : `<div class="bxr-empty">${NA}</div>`;
  return `${tabs}<div class="bxr" data-boss="${id}">
    <div class="bxr-hero"><b class="nm">${T.name}</b><span class="tl">${T.title}</span>${head}</div>
    <div class="bxr-big"><span><b>${v(L.tries)}</b>挑战</span><span><b class="zhu">${v(L.kills)}</b>斩</span><span><b>${v(L.retreats)}</b>撤</span><span><b>${v(L.deaths)}</b>陨</span></div>
    <div class="mj-row"><span class="k">最好一次</span><span class="v">${best ? `${best.phase >= 2 ? "二阶段" : "一阶段"} · ${best.hpLeft <= 0 ? "斩" : "削至 " + pct(best.hpLeft) + "%"}<small>${realmName(best.realm)}</small>` : NA}</span></div>
    <div class="mj-row"><span class="k">最快斩</span><span class="v">${L.fastest != null ? mmss(L.fastest) : NA}</span></div>
    <div class="mj-row"><span class="k">处决</span><span class="v">威折 ×${v(ex.break)} · 终结 ×${v(ex.final)}</span></div>
    <div class="bxr-h"><span>近十次</span><small>出行 · 境界 · 结果 · 削至 · 用时</small></div>
    <div class="bxr-list">${rows}</div></div>`;
}
// 镜外浮签：近十次成长图
export function bossSide(p, S = {}) {
  const ids = bossesWithLog(p);
  const id = S.boss && ids.includes(S.boss) ? S.boss : ids[0] || "qingya";
  const L = logOf(p, id), T = BOSS_TEXT[id] || { name: NAME[id] || id };
  const sheet = '<i class="ink-sheet" aria-hidden="true"></i>';
  if (!L || !(L.log || []).length) return `<div class="abs empty-hint"><b>尚无战报</b>与首领交手之后，每一次都会记在这里。</div>`;
  const log = L.log;
  const W = 248, H = 150, n = log.length, gap = W / Math.max(n, 6);
  const cols = log.map((x, i) => {
    const k = prog(x), h = Math.max(3, k * H), kill = x.result === "kill";
    return `<div class="c ${kill ? "kill" : ""}" style="left:${(i + 0.5) * gap}px" title="第 ${x.run ?? NA} 次出行 · ${realmName(x.realm)} · ${kill ? "斩" : "削至 " + pct(x.hpLeft) + "%"}">
      <i style="height:${h.toFixed(0)}px"></i>${kill ? `<span class="ink-seal" style="--s:18px">斩</span>` : i === n - 1 || i === 0 ? `<em style="bottom:${(h + 4).toFixed(0)}px">${Math.round(k * 100)}</em>` : ""}<small>${realmShort(x.realm)}</small></div>`;
  }).join("");
  const fk = L.firstKill;
  const first = log[0], lastX = log[n - 1];
  const sum = fk ? `${T.name} · 第 ${L.tries} 次 · 首斩于${realmName(fk.realm)}` : `${T.name} · 第 ${L.tries} 次 · 最好削至 ${L.best ? pct(L.best.hpLeft) + "%" : NA}`;
  const trend = n >= 2 ? `从 ${realmShort(first.realm)}削去 ${Math.round(prog(first) * 100)}%，到 ${realmShort(lastX.realm)}${lastX.result === "kill" ? "斩下" : "削去 " + Math.round(prog(lastX) * 100) + "%"}` : "";
  return `<section class="abs slip ink-paper bxr-slip" data-slip="boss" data-key="${id}">${sheet}<div class="sh"><span class="t">${T.name}</span><span class="s">近 ${n} 次</span></div>
    <div class="bxr-chart" style="width:${W}px;height:${H}px"><i class="half"></i><b class="half-l">二</b>${cols}</div>
    <div class="bxr-cap">竖笔 = 那一次削去的气血；朱线以上 = 打进了二阶段。</div>
    <div class="bxr-sum">${sum}</div>${trend ? `<div class="bxr-cap">${trend}</div>` : ""}</section>`;
}
