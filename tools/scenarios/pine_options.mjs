// 迎客松"黑团"对比（只在测试里临时替换，不改游戏）：同一机位截 现状 / 甲 墨团 / 乙 淡彩 / 丙 墨团 + 针叶不描内线，
// 高、低两档各一组；另截竹林、杂树的现状与同法处理后的样子。
// 用法：node tools/run.mjs pine_options "scene=run&region=r1&slot=6"；拼图见 docs/ui/v2/png/pine_compare*.png
export default async function (page, c) {
  await page.waitForFunction(() => window.__game && __game.run && __game.run.state === "play" && __game.heroSource, null, { timeout: 120000 });
  await c.wait(1200);
  const info = await c.ev(() => {
    const G = __game, T = G.THREE, S = G.scene;
    const E = G.ctx.enemies;
    G.run.clearEnemies();
    E.auto = !1;
    G.player.debug.god = !0;
    document.querySelectorAll(".ink-toast,.mk-toast").forEach((n) => n.remove());
    // ---- 找材质 ----
    const pick = (hex) => {
      const ims = [];
      // 只取关卡里的（样张地图里也有一份同色材质，隐藏着）
      S.traverseVisible((o) => o.isInstancedMesh && o.material.map && o.material.color.getHex() === hex && ims.push(o));
      return ims;
    };
    const pads = pick(0x2f5e46), leaves = pick(0x4f8a58);
    const where = (im) => { const m = new T.Matrix4(), v = new T.Vector3(); im.getMatrixAt(0, m); return v.setFromMatrixPosition(m).toArray(); };
    // ---- 贴图 ----
    const R = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const canvasTex = (draw) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      draw(cv.getContext("2d"), 256);
      const t = new T.CanvasTexture(cv);
      t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    // 原松针贴图的形状，笔色改成浅灰（让材质颜色与光照决定浓淡）
    const needles = (gray) => canvasTex((g, w) => {
      g.lineCap = "round";
      for (let c = 0; c < 7; c++) {
        const cx = w / 2 + (R() - 0.5) * w * 0.45, cy = w / 2 + (R() - 0.5) * w * 0.45;
        for (let k = 0; k < 26; k++) {
          const a = (k / 26) * Math.PI * 2 + R() * 0.2, l = w * (0.1 + 0.07 * R());
          const v = Math.round(gray * (0.8 + 0.2 * R()));
          g.strokeStyle = `rgb(${v},${v},${v})`;
          g.globalAlpha = 0.65 + 0.35 * R();
          g.lineWidth = 2 + R() * 2.5;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
          g.stroke();
        }
      }
    });
    // 墨团：几簇实心的针团（外缘是针尖），簇与簇深浅不同（浓 / 中 / 淡），簇内中心略深、上沿略淡
    const clumps = (tones) => canvasTex((g, w) => {
      g.lineCap = "round";
      const n = 6;
      for (let c = 0; c < n; c++) {
        const cx = w * (0.28 + 0.44 * R()), cy = w * (0.28 + 0.44 * R()), r = w * (0.13 + 0.07 * R());
        const tone = tones[c % tones.length];
        const grd = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
        grd.addColorStop(0, `rgb(${Math.min(255, tone + 40)},${Math.min(255, tone + 40)},${Math.min(255, tone + 40)})`);
        grd.addColorStop(1, `rgb(${tone},${tone},${tone})`);
        g.fillStyle = grd;
        g.strokeStyle = `rgb(${tone},${tone},${tone})`;
        g.globalAlpha = 1;
        g.beginPath();
        g.ellipse(cx, cy, r * 0.78, r * 0.62, R() * 3, 0, Math.PI * 2);
        g.fill();
        // 外缘一圈针尖：短笔向外放射
        for (let k = 0; k < 40; k++) {
          const a = (k / 40) * Math.PI * 2 + R() * 0.15, l0 = r * 0.55, l1 = r * (0.95 + 0.25 * R());
          g.lineWidth = 2 + R() * 2;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * l0, cy + Math.sin(a) * l0 * 0.85);
          g.lineTo(cx + Math.cos(a) * l1, cy + Math.sin(a) * l1 * 0.85);
          g.stroke();
        }
      }
    });
    const orig = { padMap: pads[0] && pads[0].material.map, leafMap: leaves[0] && leaves[0].material.map };
    window.__pine = {
      pads, leaves, orig,
      tex: { needlesLight: needles(225), clumps: clumps([120, 175, 225, 150, 205, 95]), bambooLight: null },
      inkFS: G.ink.mat.fragmentShader,
    };
    // 竹叶浅色版（同原形状）
    window.__pine.tex.bambooLight = canvasTex((g, w) => {
      const R2 = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
      const leaf = (x, y, len, wid, ang, alpha) => { g.save(); g.translate(x, y); g.rotate(ang); g.globalAlpha = alpha; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.35, -wid, len, 0); g.quadraticCurveTo(len * 0.35, wid * 0.7, 0, 0); g.fill(); g.restore(); };
      for (let k = 0; k < 4; k++) {
        const v = 150 + Math.round(R2() * 90);
        g.fillStyle = `rgb(${v},${v},${v})`;
        const cx = w * (0.2 + 0.6 * R2()), cy = w * (0.15 + 0.3 * R2()), n = 3 + Math.floor(R2() * 3), base = Math.PI * (0.25 + 0.5 * R2());
        for (let j = 0; j < n; j++) leaf(cx, cy, w * (0.3 + 0.18 * R2()), w * 0.05, base + (j - n / 2) * 0.32 + (R2() - 0.5) * 0.2, 0.75 + 0.25 * R2());
      }
    });
    // 原贴图像素：确认笔色
    const img = orig.padMap.image, cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const g2 = cv.getContext("2d"); g2.drawImage(img, 0, 0);
    const d = g2.getImageData(0, 0, cv.width, cv.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) (sum += (d[i] + d[i + 1] + d[i + 2]) / 3), n++;
    return { pads: pads.length, leaves: leaves.length, padAt: pads[0] && where(pads[0]), leafAt: leaves[0] && where(leaves[0]), padTexMeanRGB: +(sum / n).toFixed(1), padColor: "#2f5e46" };
  });
  c.log("INFO", JSON.stringify(info));

  // 方案：材质（颜色、贴图）+ 是否给水墨后期打"针叶"标记（只描外轮廓）
  const apply = (v) =>
    c.ev((v) => {
      const P = __pine, G = __game;
      const set = (ims, map, hex, soft) => {
        const m = ims[0] && ims[0].material;
        if (!m) return;
        m.map = map;
        m.color.setHex(hex);
        for (const im of ims) if (im.customDepthMaterial) (im.customDepthMaterial.map = map), (im.customDepthMaterial.needsUpdate = !0);
        // 针叶标记：颜色通道 alpha 写 0.5（水墨后期据此只描大的深度跳变，即树冠外轮廓）
        if (!m.userData.jxOBC) (m.userData.jxOBC = m.onBeforeCompile), (m.userData.jxKey = m.customProgramCacheKey);
        m.onBeforeCompile = (sh, r) => {
          m.userData.jxOBC.call(m, sh, r);
          if (m.userData.soft) sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  gl_FragColor.a = 0.5;");
        };
        m.userData.soft = soft;
        m.customProgramCacheKey = () => m.userData.jxKey() + (soft ? "|soft" : "");
        m.needsUpdate = !0;
      };
      set(P.pads, v.padTex ? P.tex[v.padTex] : P.orig.padMap, v.padColor, !!v.soft);
      set(P.leaves, v.leafTex ? P.tex[v.leafTex] : P.orig.leafMap, v.leafColor, !!v.soft);
      // 水墨后期：针叶像素（alpha < 0.75）只认大的深度跳变（树冠对地面），不描折角线
      const im = G.ink.mat;
      let fs = P.inkFS;
      if (v.soft) {
        fs = fs.replace("vec3 col = toSRGB(texture2D(tColor, vUv).rgb);", "vec4 col4 = texture2D(tColor, vUv);\n  vec3 col = toSRGB(col4.rgb);\n  float leafy = 1.0 - step(0.75, col4.a);");
        fs = fs.replace("float edge = smoothstep(0.035, 0.11, sil) + 0.8 * smoothstep(0.012, 0.045, crease);", "float edge = mix(smoothstep(0.035, 0.11, sil) + 0.8 * smoothstep(0.012, 0.045, crease), smoothstep(0.1, 0.22, sil), leafy);");
      }
      if (im.fragmentShader !== fs) (im.fragmentShader = fs), (im.needsUpdate = !0);
    }, v);
  const V = {
    now: { padColor: 0x2f5e46, leafColor: 0x4f8a58 },
    jia: { padTex: "clumps", padColor: 0x55785f, leafColor: 0x4f8a58 },
    yi: { padTex: "needlesLight", padColor: 0x4e7a5f, leafColor: 0x4f8a58 },
    bing: { padTex: "clumps", padColor: 0x55785f, leafColor: 0x4f8a58, soft: !0 },
  };
  const shoot = async (spot, tag) => {
    await c.ev(([x, z]) => (__game.player.spawn(x, z), __game.rig.update(1, !0)), spot);
    await c.wait(700);
    for (const [k, v] of Object.entries(V)) {
      await apply(v);
      await c.wait(700);
      await c.shot(`${tag}_${k}`);
      await c.shot(`${tag}_${k}_crop`, { clip: { x: 160, y: 110, width: 640, height: 360 } });
    }
    await apply(V.now);
  };
  const pineSpot = [-62, -40];
  await shoot(pineSpot, "pine_hi");
  await c.ev(() => __game.setQuality("low"));
  await c.wait(600);
  await shoot(pineSpot, "pine_lo");
  await c.ev(() => __game.setQuality("high"));
  // 竹林 / 杂树：现状 vs 同法（竹叶浅色笔 + 针叶标记）
  if (info.leafAt) {
    await c.ev(([x, z]) => (__game.player.spawn(x + 2, z + 4), __game.rig.update(1, !0)), [info.leafAt[0], info.leafAt[2]]);
    await c.wait(800);
    await apply(V.now);
    await c.wait(500);
    await c.shot("bamboo_now");
    await apply({ padColor: 0x2f5e46, leafTex: "bambooLight", leafColor: 0x4f8a58, soft: !0 });
    await c.wait(700);
    await c.shot("bamboo_fix");
    await apply(V.now);
  }
  c.log("errors", await c.ev(() => window.__errors.length));
}
