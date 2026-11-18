// 程序化材质配方（精细化小样 v1）。每个配方：field(uv) → vec4(h 米, m1, m2, m3)，以及收尾着色 albedo / rough / inkLine / recipeAO。
// 几何体 UV 一律以"米"为单位，贴图 repeat = 1 / meters，所以同一配方在不同构件上纹理密度一致。
// 颜色写 sRGB 十六进制（hex()），淡彩水墨基调：灰瓦、褪色朱漆、赭红墙、青灰石、黄土。
const S = (o) => o;

// 瓦（筒瓦 / 板瓦表面）：陶土颗粒 + 地衣斑 + 烟渍
export const TILE = S({
  name: "tile", size: 512, meters: 0.5, nrm: 1.0, aoR: 0.006, aoK: 0.9, cavR: 0.002, seed: 3,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    float g = fbmT6(uv * 6.0, vec2(6.0));
    float pit = smoothstep(0.62, 0.8, vnoiseT(uv * 70.0, vec2(70.0)));
    vec4 v = voroT(uv * 9.0, vec2(9.0));
    float lich = smoothstep(0.42, 0.15, v.x) * step(0.82, v.z) * smoothstep(0.5, 0.7, fbmT(uv * 3.0 + 2.0, vec2(3.0)));
    float soot = fbmT(uv * 2.0 + 7.0, vec2(2.0));
    float h = g * 0.0012 - pit * 0.0006 + lich * 0.0005;
    return vec4(h, lich, soot, g);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 c = mix(HX(0x525c64), HX(0x6b707e), F.a);              // 0x525c64 → 0x6b707e 青灰陶
    c *= 0.82 + 0.3 * F.b;
    c = mix(c, HX(0xa8ae8d), F.g * 0.85);                        // 0xa8ae8d 地衣
    c *= 1.0 - 0.35 * clamp(-cav, 0.0, 1.0);                        // 缝里积灰
    return c * mix(0.75, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.78 + 0.15 * F.g; }
  float inkLine(vec4 F, float cav, float ao){ return smoothstep(0.2, 0.7, -cav) * 0.6; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 朱漆木（柱、额枋）：木纹 + 漆面断纹（冰裂）+ 磨损露木
export const LACQUER = S({
  name: "lacquer", size: 512, meters: 1.0, nrm: 1.0, aoR: 0.01, aoK: 1.0, cavR: 0.002, seed: 5,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    float grain = fbmT(vec2(uv.x * 14.0, uv.y * 2.0), vec2(14.0, 2.0));
    vec4 v = voroT(uv * vec2(34.0, 22.0), vec2(34.0, 22.0));
    float crack = 1.0 - smoothstep(0.0, 0.06, v.y - v.x);
    float wear = smoothstep(0.74, 0.84, fbmT6(uv * 3.0 + 1.3, vec2(3.0)) + 0.1 * grain);
    float lac = (1.0 - wear) * 0.0008;
    float h = lac - crack * 0.0005 * (1.0 - wear) + grain * 0.0004 * wear + v.z * 0.0001;
    return vec4(h, crack * (1.0 - wear), wear, grain);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 lac = mix(HX(0x8e3122), HX(0xa63a2c), vnoiseT(uv * 9.0, vec2(9.0)));   // 0x8e3122 → 0xa63a2c
    vec3 wood = mix(HX(0x5a3a30), HX(0x6e4c40), F.a);                              // 磨掉漆皮处：深赭木色
    vec3 c = mix(lac, wood, F.b);
    c = mix(c, HX(0x4a2620), F.g * 0.55);                                            // 断纹（细、偏暗红而不是黑）
    c *= 1.0 + 0.25 * clamp(cav, 0.0, 1.0) * (1.0 - F.b);
    return c * mix(0.8, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return mix(0.42, 0.82, F.b); }
  float inkLine(vec4 F, float cav, float ao){ return F.g * 0.7 + smoothstep(0.3, 0.8, -cav) * 0.3; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 旧木（门窗、椽、斗拱）：顺纹、年轮、干裂，灰化
export const WOOD = S({
  name: "wood", size: 512, meters: 1.0, nrm: 1.2, aoR: 0.008, aoK: 1.0, cavR: 0.002, seed: 7,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    float w = fbmT(vec2(uv.x * 6.0, uv.y * 1.0), vec2(6.0, 1.0));
    float ring = fract(uv.x * 26.0 + w * 3.0);
    ring = smoothstep(0.0, 0.15, ring) * smoothstep(1.0, 0.6, ring);
    float split = smoothstep(0.93, 0.99, ridgeT(vec2(uv.x * 18.0, uv.y * 1.5), vec2(18.0, 1.5))) * smoothstep(0.4, 0.7, vnoiseT(uv * vec2(4.0, 3.0), vec2(4.0, 3.0)));
    float grey = fbmT(uv * 3.0 + 4.0, vec2(3.0));
    float h = ring * 0.0006 + w * 0.0006 - split * 0.0015;
    return vec4(h, split, grey, ring);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 c = mix(HX(0x4a3a34), HX(0x604d44), F.a);              // 0x4a3a34 → 0x604d44
    c = mix(c, HX(0x6c6c68), smoothstep(0.45, 0.75, F.b) * 0.7);   // 0x6c6c68 灰化
    c *= 1.0 - F.g * 0.6;
    c *= 1.0 - 0.3 * clamp(-cav, 0.0, 1.0);
    c *= 1.0 + 0.2 * clamp(cav, 0.0, 1.0);
    return c * mix(0.75, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.82; }
  float inkLine(vec4 F, float cav, float ao){ return F.g * 0.8 + smoothstep(0.3, 0.8, -cav) * 0.3; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 赭红抹灰墙：斑驳、雨渍，局部剥落露出青砖
export const PLASTER = S({
  name: "plaster", size: 512, meters: 3.0, nrm: 1.0, aoR: 0.03, aoK: 1.2, cavR: 0.006, seed: 9,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    float m = fbmT6(uv * 3.0, vec2(3.0));
    float spall = smoothstep(0.8, 0.83, fbmT6(uv * 2.0 + 5.0, vec2(2.0)) + 0.08 * vnoiseT(uv * 25.0, vec2(25.0)));
    // 剥落处的青砖（0.24 × 0.06 米，顺砖错缝）：贴图 3 米 → 12.5 × 50 块
    vec2 b = uv * vec2(12.5, 50.0);
    b.x += step(1.0, mod(floor(b.y), 2.0)) * 0.5;
    vec2 f = fract(b);
    float joint = 1.0 - smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x) * 0.24, min(f.y, 1.0 - f.y) * 0.06) * 25.0);
    float h = (1.0 - spall) * (0.012 + m * 0.002) + spall * (0.002 - joint * 0.003);
    return vec4(h, spall, joint * spall, m);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 wall = mix(HX(0x8a4a40), HX(0x9a5a4c), F.a);          // 褪色赭红（压低饱和，让它是'点色'而不是满墙橘红）
    wall = mix(wall, HX(0xb49a88), smoothstep(0.6, 0.8, fbmT(uv * 1.5 + 9.0, vec2(1.5))) * 0.18); // 粉化泛白（大片、轻）
    vec3 brick = mix(HX(0x696967), HX(0x565656), vnoiseT(uv * vec2(12.5, 50.0), vec2(12.5, 50.0)));   // 青砖
    brick = mix(brick, HX(0xa8ab9b), F.b);                       // 砖缝灰浆
    vec3 c = mix(wall, brick, F.g);
    c *= 1.0 - 0.3 * clamp(-cav, 0.0, 1.0);
    return c * mix(0.7, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.9; }
  float inkLine(vec4 F, float cav, float ao){ return smoothstep(0.2, 0.7, -cav) * 0.8; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 青砖（槛墙、下碱）：顺砖错缝，每块深浅不一，棱角崩缺
export const BRICK = S({
  name: "brick", size: 512, meters: 1.44, nrm: 1.2, aoR: 0.01, aoK: 1.2, cavR: 0.003, seed: 11,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    vec2 b = uv * vec2(6.0, 24.0);
    float row = floor(b.y);
    b.x += mod(row, 2.0) * 0.5;
    vec2 id = floor(b), f = fract(b);
    float ex = min(f.x, 1.0 - f.x) * 0.24, ey = min(f.y, 1.0 - f.y) * 0.06;
    float e = min(ex, ey);
    float chip = smoothstep(0.55, 0.8, vnoiseT(uv * 60.0, vec2(60.0)));
    float joint = 1.0 - smoothstep(0.004, 0.009 + chip * 0.006, e);
    float tone = hT(id, vec2(6.0, 24.0));
    float h = (1.0 - joint) * (0.01 + 0.001 * fbmT(uv * 20.0, vec2(20.0))) - chip * 0.001;
    return vec4(h, joint, tone, chip);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 c = mix(HX(0x5b6260), HX(0x7b7d7f), F.b);              // 0x5b6260 → 0x7b7c7f
    c = mix(c, HX(0xabac90), F.g);                               // 灰浆 0xabaa90
    c *= 1.0 - 0.3 * clamp(-cav, 0.0, 1.0);
    c *= 1.0 + 0.25 * clamp(cav, 0.0, 1.0);
    return c * mix(0.7, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.88; }
  float inkLine(vec4 F, float cav, float ao){ return F.g * 0.75; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 条石（台基、踏步、柱础、石灯）：斧剁纹 + 崩口 + 地衣
export const STONE = S({
  name: "stone", size: 512, meters: 1.5, nrm: 1.0, aoR: 0.012, aoK: 1.0, cavR: 0.004, seed: 13,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    float g = fbmT6(uv * 4.0, vec2(4.0));
    float chisel = sin((uv.x + uv.y * 0.15 + 0.02 * vnoiseT(uv * 8.0, vec2(8.0))) * 6.2832 * 90.0) * 0.5 + 0.5;
    float pit = smoothstep(0.7, 0.9, vnoiseT(uv * 45.0, vec2(45.0)));
    vec4 v = voroT(uv * 9.0, vec2(9.0));
    float lich = smoothstep(0.35, 0.1, v.x) * step(0.7, v.z) * smoothstep(0.4, 0.6, g);
    float h = g * 0.004 + chisel * 0.0004 - pit * 0.0015 + lich * 0.0003;
    return vec4(h, lich, pit, g);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 c = mix(HX(0x9c9e94), HX(0xc0c1b4), F.a);             // 青白石
    c *= 0.9 + 0.18 * vnoiseT(uv * 12.0, vec2(12.0));
    c = mix(c, HX(0xbab59a), F.g * 0.7);                          // 地衣 0xbab59a
    c *= 1.0 - 0.4 * clamp(-cav, 0.0, 1.0);
    c *= 1.0 + 0.2 * clamp(cav, 0.0, 1.0);
    return c * mix(0.7, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.86; }
  float inkLine(vec4 F, float cav, float ao){ return smoothstep(0.3, 0.8, -cav) * 0.6; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 方砖墁地（台明顶面）：0.5 米方砖，缝里积土长苔，砖面磨光
export const PAVE = S({
  name: "pave", size: 512, meters: 2.0, nrm: 1.2, aoR: 0.012, aoK: 1.2, cavR: 0.004, seed: 17,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    vec2 b = uv * 4.0;
    vec2 id = floor(b), f = fract(b);
    float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 0.5;
    float joint = 1.0 - smoothstep(0.003, 0.008, e);
    float tilt = (hT(id, vec2(4.0)) - 0.5) * 0.004 * (f.x - 0.5) + (hT(id + 3.0, vec2(4.0)) - 0.5) * 0.004 * (f.y - 0.5);
    float crack = smoothstep(0.96, 0.995, ridgeT(uv * 7.0 + 1.1, vec2(7.0))) * step(0.7, hT(id + 9.0, vec2(4.0)));
    float h = (1.0 - joint) * (0.008 + tilt + fbmT(uv * 16.0, vec2(16.0)) * 0.001) - crack * 0.002;
    return vec4(h, joint, hT(id + 5.0, vec2(4.0)), crack);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 c = mix(HX(0x75726e), HX(0x92958a), F.b);              // 0x75726e → 0x92958a
    c *= 0.9 + 0.2 * fbmT(uv * 10.0, vec2(10.0));
    c = mix(c, HX(0x4f6449), F.g);                                // 缝里苔土 0x4f6449
    c *= 1.0 - 0.6 * F.a;
    return c * mix(0.7, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return mix(0.7, 0.95, F.g); }
  float inkLine(vec4 F, float cav, float ao){ return F.g * 0.6 + F.a * 0.8; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 山石（三向投影）：v 方向 = 世界竖直，层理 + 节理裂隙 + 风化凹坑 + 地衣 —— 皴法的"笔路"就是层理与裂隙
export const ROCK = S({
  name: "rock", size: 1024, meters: 3.0, nrm: 1.4, aoR: 0.05, aoK: 1.3, cavR: 0.008, seed: 19,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    float w = fbmT(uv * 3.0, vec2(3.0));
    float layer = uv.y * 9.0 + w * 1.6;
    float lf = fract(layer);
    float strata = smoothstep(0.0, 0.12, lf) * (1.0 - smoothstep(0.82, 1.0, lf));
    vec4 v = voroT(uv * vec2(2.0, 3.0), vec2(2.0, 3.0));
    float joint = (1.0 - smoothstep(0.0, 0.035, v.y - v.x)) * smoothstep(0.6, 0.7, fbmT(uv * 3.0 + 9.0, vec2(3.0)));
    float g = fbmT6(uv * 5.0 + 3.0, vec2(5.0));
    float pit = smoothstep(0.62, 0.8, vnoiseT(uv * 30.0, vec2(30.0))) * 0.6 + smoothstep(0.7, 0.85, g) * 0.4;
    float lich = smoothstep(0.55, 0.75, fbmT(uv * 8.0 + 11.0, vec2(8.0))) * smoothstep(0.3, 0.6, g);
    float h = strata * 0.025 + g * 0.03 - joint * 0.03 - pit * 0.01 + v.z * 0.006;
    return vec4(h, joint, lich, g);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 c = mix(HX(0x9a9d94), HX(0xc6c7ba), F.a);             // 青灰石（偏淡，留给皴笔和墨线压暗）
    c *= 0.88 + 0.2 * vnoiseT(uv * vec2(3.0, 18.0), vec2(3.0, 18.0));
    c = mix(c, HX(0xc9c2a8), F.b * 0.45);                         // 地衣
    c *= 1.0 - 0.45 * clamp(-cav, 0.0, 1.0);
    c *= 1.0 + 0.3 * clamp(cav, 0.0, 1.0);
    return c * mix(0.6, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.9; }
  float inkLine(vec4 F, float cav, float ao){ return F.g * 0.5 + smoothstep(0.35, 0.9, -cav) * 0.35; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 地面（俯投影）：黄土 + 碎石；albedo.a 不用，碎石 / 草的配比由顶点属性 aSplat 控制（材质里做）
export const GROUND = S({
  name: "ground", size: 1024, meters: 4.0, nrm: 1.0, aoR: 0.02, aoK: 1.4, cavR: 0.006, seed: 23,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    vec2 wq = uv * 60.0 + (vec2(vnoiseT(uv * 40.0, vec2(40.0)), vnoiseT(uv * 40.0 + 5.0, vec2(40.0))) - 0.5) * 0.9;
    vec4 v = voroT(wq, vec2(60.0));
    float clus = smoothstep(0.5, 0.7, fbmT(uv * 5.0 + 1.7, vec2(5.0)));
    float peb = smoothstep(0.38, 0.2, v.x) * step(0.82 - 0.4 * clus, v.z);
    float pebH = peb * (0.006 + v.w * 0.01) * smoothstep(0.38, 0.1, v.x);
    vec4 v2 = voroT(uv * 22.0 + 0.5, vec2(22.0));
    float big = smoothstep(0.38, 0.22, v2.x) * step(0.86, v2.z);
    float g = fbmT6(uv * 6.0, vec2(6.0));
    vec4 vc = voroT(uv * 10.0, vec2(10.0));
    float crack = (1.0 - smoothstep(0.0, 0.03, vc.y - vc.x)) * smoothstep(0.66, 0.78, fbmT(uv * 2.0, vec2(2.0)));
    float h = g * 0.01 + pebH + big * 0.02 - crack * 0.004;
    return vec4(h, max(peb, big), g, v.w);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 dirt = mix(HX(0xc4baa2), HX(0xd9d0b9), F.b);           // 宣纸色的淡黄土
    vec3 peb = mix(HX(0xaeb0a6), HX(0xd6d5cc), F.a);            // 碎石（浅灰）
    vec3 c = mix(dirt, peb, F.g);
    c *= 1.0 - 0.18 * clamp(-cav, 0.0, 1.0);
    return c * mix(0.8, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.92; }
  float inkLine(vec4 F, float cav, float ao){ return smoothstep(0.5, 1.0, -cav) * 0.25; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 树皮：纵向深裂（拉长的 Voronoi）
export const BARK = S({
  name: "bark", size: 512, meters: 1.2, nrm: 1.5, aoR: 0.02, aoK: 1.4, cavR: 0.004, seed: 29,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    vec4 v = voroT(uv * vec2(9.0, 3.0), vec2(9.0, 3.0));
    float fis = 1.0 - smoothstep(0.0, 0.18, v.y - v.x);
    float g = fbmT(uv * vec2(12.0, 4.0), vec2(12.0, 4.0));
    float h = (1.0 - fis) * 0.012 + g * 0.004 + v.z * 0.003;
    return vec4(h, fis, g, v.z);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 c = mix(HX(0x4b4040), HX(0x746b62), F.b);              // 0x4b4040 → 0x746b62
    c = mix(c, HX(0x221819), F.g * 0.8);
    c = mix(c, HX(0x7d907a), smoothstep(0.6, 0.8, F.a) * 0.4);
    return c * mix(0.6, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.9; }
  float inkLine(vec4 F, float cav, float ao){ return F.g * 0.8; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 竹竿：竖向细纹 + 白粉斑（节由几何体做）
export const BAMBOO = S({
  name: "bamboo", size: 256, meters: 0.5, nrm: 0.6, aoR: 0.004, aoK: 0.8, cavR: 0.002, seed: 31,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    float s = fbmT(vec2(uv.x * 40.0, uv.y * 2.0), vec2(40.0, 2.0));
    float spot = smoothstep(0.6, 0.75, fbmT(uv * 4.0, vec2(4.0)));
    return vec4(s * 0.0004, spot, s, 0.0);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 c = mix(HX(0x4e7d4c), HX(0x75a765), F.b);              // 0x4e7d4c → 0x75a765
    c = mix(c, HX(0x9ea78d), F.g * 0.5);                         // 白粉 0x9ea78d
    return c;
  }
  float rough(vec4 F, float cav){ return 0.55; }
  float inkLine(vec4 F, float cav, float ao){ return 0.0; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

// 彩画（额枋、平板枋）：褪色的青绿旋子彩画——箍头 + 找头的青绿相间带（u 沿构件长度，按 1 米重复）
export const CAIHUA = S({
  name: "caihua", size: 512, meters: 1.0, nrm: 0.7, aoR: 0.006, aoK: 0.8, cavR: 0.002, seed: 37,
  field: /* glsl */ `
  vec4 field(vec2 uv){
    float x = uv.x, y = uv.y;
    float band = step(0.5, fract(x * 2.0));                          // 青 / 绿相间
    vec2 c = vec2(fract(x * 2.0) - 0.5, (fract(y * 4.0) - 0.5) * 0.5);
    float ring = smoothstep(0.02, 0.0, abs(length(c) - 0.16)) + smoothstep(0.015, 0.0, abs(length(c) - 0.08));
    float edge = smoothstep(0.02, 0.0, abs(fract(x * 2.0) - 0.02));
    float peel = smoothstep(0.72, 0.78, fbmT6(uv * 4.0 + 3.0, vec2(4.0)));
    float h = (1.0 - peel) * 0.0006 + fbmT(uv * 30.0, vec2(30.0)) * 0.0002;
    return vec4(h, band, clamp(ring + edge, 0.0, 1.0), peel);
  }`,
  shade: /* glsl */ `
  vec3 albedo(vec4 F, float cav, float ao, vec2 uv){
    vec3 qing = HX(0x3e6783), lv = HX(0x4a947a);                // 0x3e6783 青、0x4a947a 绿（褪色）
    vec3 c = mix(qing, lv, F.g);
    c = mix(c, HX(0xd8d2c0), F.b * 0.8);                         // 白粉线 0xd8d2c0
    c = mix(c, HX(0x60424b), F.a);                                // 剥落露木 0x60424b
    c *= 0.85 + 0.25 * fbmT(uv * 6.0, vec2(6.0));
    return c * mix(0.75, 1.0, ao);
  }
  float rough(vec4 F, float cav){ return 0.75; }
  float inkLine(vec4 F, float cav, float ao){ return F.b * 0.3; }
  float recipeAO(vec4 F, float cav){ return 1.0; }`,
});

export const ALL = { TILE, LACQUER, WOOD, PLASTER, BRICK, STONE, PAVE, ROCK, GROUND, BARK, BAMBOO, CAIHUA };
