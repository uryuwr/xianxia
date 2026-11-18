// 公共 GLSL 片段：哈希、值噪声、分形噪声。烘焙贴图、材质、后期都会用到。

export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++){ s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.3; a *= 0.5; } return s / 0.97; }
// 可平铺的值噪声（周期 per）
float vnoiseT(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  #define HT(o) hash12(mod(i + o, per))
  return mix(mix(HT(vec2(0.0)), HT(vec2(1.0, 0.0)), f.x), mix(HT(vec2(0.0, 1.0)), HT(vec2(1.0, 1.0)), f.x), f.y);
  #undef HT
}
float fbmT(vec2 p, vec2 per){ float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++){ s += a * vnoiseT(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s / 0.94; }
`;

// JS 侧的同款值噪声（地形高度、植被分布在 CPU 上计算，供碰撞使用）
function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, oct = 4) {
  let a = 0.5, s = 0, t = 0;
  for (let k = 0; k < oct; k++) {
    s += a * vnoise(x, y);
    t += a;
    const nx = 1.6 * x - 1.2 * y + 17.3, ny = 1.2 * x + 1.6 * y + 17.3;
    x = nx;
    y = ny;
    a *= 0.5;
  }
  return s / t;
}
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

// 可复现的随机数
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
