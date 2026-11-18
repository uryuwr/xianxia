// 画质档位：高 / 中 / 低 / 自动。设置保存在 moxian.settings.quality（与流程组、瞄准模块共用一个键，合并写入）。
//   high    原画质（分辨率上限 1.5 倍、4×MSAA、4096 阴影、植被全密度、8 向墨线）
//   medium  分辨率上限 1 倍（按 CSS 像素）、2×MSAA、2048 阴影、草 / 小石 / 竹叶 70%
//   low     分辨率 0.75 倍、无 MSAA、1024 阴影、植被不投影、草 / 小石 / 竹叶 45%、4 向墨线
//   auto    起始档按显卡猜（集显 / 移动端 → 中，其他 → 高）；出行局 / 洞府里帧间隔中位数持续高于 20ms（< 50 帧）就降一档，不自动升档；
//           降到的档位记在 moxian.settings.qualityAuto，下次启动从这一档开始（设置里重新点"自动"会清掉）
// 接口：new Quality({ renderer, scene, ink, resize })；.mode（设置值）、.tier（实际档位）、.set(mode)、.apply()、.sync()（场景换了灯光 / 植被后调用）、
//       .frame(rawDt, live)（主循环每帧调用，自动档的帧时统计）
export const TIERS = {
  high: { name: "高", maxPR: 1.5, scale: 1, msaa: 4, shadow: 4096, veg: 1, vegCast: !0, taps: 8 },
  medium: { name: "中", maxPR: 1, scale: 1, msaa: 2, shadow: 2048, veg: 0.7, vegCast: !0, taps: 8 },
  low: { name: "低", maxPR: 1, scale: 0.75, msaa: 0, shadow: 1024, veg: 0.45, vegCast: !1, taps: 4 },
};
export const MODES = [["auto", "自动"], ["high", "高"], ["medium", "中"], ["low", "低"]];
const ORDER = ["high", "medium", "low"];
const KEY = "moxian.settings";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

// 集显 / 移动端 / 软件渲染：自动档从"中"开始
export function guessTier(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (/SwiftShader|llvmpipe|Software/i.test(name)) return "low";
    if (/Intel|UHD|Iris|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d|Mali|Adreno|PowerVR|Apple GPU|Apple M/i.test(name)) return "medium";
  } catch {}
  return "high";
}

export class Quality {
  constructor({ renderer, scene, ink, resize }) {
    this.renderer = renderer;
    this.scene = scene;
    this.ink = ink;
    this.resize = resize;
    const m = readAll().quality;
    this.mode = m && (m === "auto" || TIERS[m]) ? m : "auto";
    // 自动档上次降到的档位（保存在设置里，下次启动直接从这一档开始；在设置里重新点"自动"会清掉）
    const learned = readAll().qualityAuto;
    this.autoTier = TIERS[learned] ? learned : guessTier(renderer);
    this.tier = this.mode === "auto" ? this.autoTier : this.mode;
    this.samples = [];
    this.cool = 3; // 刚切换 / 刚进场景时先不统计
    this.lastAuto = null;
  }
  get T() {
    return TIERS[this.tier];
  }
  // 设置界面：mode = auto | high | medium | low
  set(mode) {
    if (mode !== "auto" && !TIERS[mode]) return;
    this.mode = mode;
    if (mode === "auto") this.autoTier = guessTier(this.renderer);
    try {
      const all = { ...readAll(), quality: mode };
      if (mode === "auto") delete all.qualityAuto;
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {}
    this.setTier(mode === "auto" ? this.autoTier : mode);
  }
  setTier(tier) {
    if (!TIERS[tier]) return;
    this.tier = tier;
    this.samples.length = 0;
    this.cool = 3;
    this.apply();
    dispatchEvent(new CustomEvent("moxian:quality", { detail: { mode: this.mode, tier } }));
  }
  pixelRatio() {
    const T = this.T;
    return Math.min(devicePixelRatio || 1, T.maxPR) * T.scale;
  }
  apply() {
    const R = this.renderer, T = this.T;
    const pr = this.pixelRatio();
    if (Math.abs(R.getPixelRatio() - pr) > 1e-3) {
      R.setPixelRatio(pr);
      this.resize && this.resize();
    }
    if (this.ink) {
      const rt = this.ink.rt;
      if (rt.samples !== T.msaa) (rt.samples = T.msaa), rt.dispose();
      this.ink.setTaps && this.ink.setTaps(T.taps);
    }
    this.sync();
  }
  // 灯光阴影尺寸、植被密度 / 投影：场景内容变了（进关卡、回洞府）之后调用
  sync(root = this.scene) {
    const T = this.T;
    root.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow && o.shadow) {
        if (o.shadow.mapSize.x !== T.shadow) {
          o.shadow.mapSize.set(T.shadow, T.shadow);
          if (o.shadow.map) o.shadow.map.dispose(), (o.shadow.map = null);
        }
      } else if (o.isInstancedMesh) {
        const u = o.userData;
        if (u.thin) {
          // 高画质保持原样（不打乱、不抽稀）
          if (T.veg < 1 && !u.thinShuffled) shuffleInstances(o, u.thin), (u.thinShuffled = !0);
          o.count = T.veg < 1 ? Math.max(1, Math.round(u.thin * T.veg)) : u.thin;
        }
        if (u.vegCast) o.castShadow = T.vegCast;
      }
    });
  }
  // 自动档：只在 3D 场景实际渲染、未暂停时统计帧间隔
  frame(raw, live) {
    if (this.mode !== "auto" || !live || document.hidden) return;
    if (this.cool > 0) return void (this.cool -= raw);
    if (raw <= 0 || raw > 0.25) return; // 切后台、加载卡住：不算
    this.samples.push(raw);
    if (this.samples.length < 90) return;
    const s = this.samples.slice().sort((a, b) => a - b), med = s[s.length >> 1];
    this.samples.length = 0;
    // 自动化测试（无头浏览器帧间隔固定约 31ms）不降档，保持画面可比
    if (navigator.webdriver && !window.__autoQualityTest) return;
    if (med > 0.02) {
      const i = ORDER.indexOf(this.tier);
      if (i < ORDER.length - 1) {
        this.lastAuto = { from: this.tier, to: ORDER[i + 1], med: +(med * 1000).toFixed(1) };
        console.log(`[quality] 自动降档 ${this.tier} → ${ORDER[i + 1]}（帧间隔中位数 ${(med * 1000).toFixed(1)}ms）`);
        this.autoTier = ORDER[i + 1];
        try {
          localStorage.setItem(KEY, JSON.stringify({ ...readAll(), qualityAuto: this.autoTier }));
        } catch {}
        this.setTier(this.autoTier);
      }
    }
  }
}

// 实例顺序打乱（固定种子）：抽稀时按前 n 个取，空间上均匀（竹叶按竹竿顺序生成，直接截断会整片缺失）
function shuffleInstances(im, n) {
  const m = im.instanceMatrix.array, c = im.instanceColor ? im.instanceColor.array : null;
  let s = 0x9e3779b9 ^ n;
  const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296);
  const tmp = new Float32Array(16);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    if (i === j) continue;
    tmp.set(m.subarray(i * 16, i * 16 + 16));
    m.copyWithin(i * 16, j * 16, j * 16 + 16);
    m.set(tmp, j * 16);
    if (c) for (let k = 0; k < 3; k++) [c[i * 3 + k], c[j * 3 + k]] = [c[j * 3 + k], c[i * 3 + k]];
  }
  im.instanceMatrix.needsUpdate = !0;
  if (im.instanceColor) im.instanceColor.needsUpdate = !0;
}

