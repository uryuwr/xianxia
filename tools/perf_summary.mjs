// 性能探针结果汇总：每段一行（cpu p50/p95/max、gpu、rAF 最大、draw call、长任务、基准、分配、寻路）。用法：node tools/perf_summary.mjs work/perf/a.json work/perf/b.json
import fs from "node:fs";
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  console.log("##", f, j.env && j.env.gpu && j.env.gpu.slice(7, 40), j.env && j.env.canvas, j.env && j.env.rt);
  for (const [k, s] of Object.entries(j.stages)) {
    if (k.startsWith("switch_")) { console.log(k.padEnd(18), "go", s.goMs, "maxCpu", s.maxFrameCpu, "long", JSON.stringify(s.longTasks)); continue; }
    if (!s.cpu) { if (s.gpu !== undefined) console.log(k.padEnd(18), "bench gpu", s.gpu); else console.log(k, JSON.stringify(s).slice(0, 150)); continue; }
    console.log(k.padEnd(18), "cpu", `${s.cpu.p50}/${s.cpu.p95}/${s.cpu.max}`.padEnd(16), "gpu", s.gpu ? `${s.gpu.p50}/${s.gpu.p95}/${s.gpu.max}`.padEnd(18) : "-", "raf max", s.raf && s.raf.max, "calls", s.calls && s.calls.p50, "long", (s.longTasks || []).length, s.bench ? "bench " + s.bench.gpu : "", "alloc", s.allocMBs, "nav", s.mods && s.mods["nav.flow"]);
  }
}
