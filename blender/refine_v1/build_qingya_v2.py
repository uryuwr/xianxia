# 墨途 · 首领「狼王青牙」精细版 v2（小样，美术管线 2026-11-18）
#   B=D:/tools/blender-4.5.16-windows-x64/blender.exe
#   $B -b -t 8 --factory-startup --python blender/refine_v1/build_qingya_v2.py              # 全流程 → docs/art/精细化小样_v1/assets/qingya_v2.glb + 贴图
#   $B -b -t 8 --factory-startup --python blender/refine_v1/build_qingya_v2.py -- --hi      # 只出高模 + 预览（调造型用）
#   $B -b -t 8 --factory-startup --python blender/refine_v1/build_qingya_v2.py -- --quick   # 粗体素快速迭代
#
# 不改原文件：骨骼（25 根）、27 段动画、命中帧全部由执行 blender/build_qingya.py 得到；这里只换网格和贴图。
# 造型思路（对症"像几何图形拼接"）：
#   - 躯干 / 肌肉块（肩胛、三角肌、大腿、小腿肚、肘尖、跗关节）/ 头骨（颅、颧弓、眉弓、吻、鼻、下颌）全部是距离场图元平滑融合的一个连续体；
#   - 毛：在基础体表面按"毛流场"撒几百束扁平的毛束（每束 = 扁椭圆截面放样，根部埋进皮里、梢部翘起），
#     束与束之间的凹缝就是水墨笔触的来源（曲率贴图 → 墨线）；颈后青白长鬃、颊鬃、尾梢是另一层（fur_light）；
#   - 骨甲：贴体厚壳 ∩ 区域，边缘倒圆 + 噪声崩口，刻内沿线、生长纹、麻点；二阶段从脊线裂开，裂缝底下埋一条发光脉。
import sys
import os
import math
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_refine import *  # noqa: E402,F401,F403

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
QUICK = "--quick" in ARGV
ONLY_HI = "--hi" in ARGV
H = 0.013 if QUICK else 0.0072      # 体素（狼单位；游戏 scale 2.2 → 约 1.6 cm）
RES = 1024 if QUICK else 2048
NAME = "qingya_v2"
rnd = random.Random(11)

ns, ARM, BONES, CAP, LEGACY = load_legacy_creature("build_qingya.py")
BODY, body_at, LX = ns["BODY"], ns["body_at"], ns["LEG_X"]
PART_BONES = CAP["part_bones"]
delete_objects(LEGACY["objs"])
log("legacy rig ready: %d bones, %d actions" % (len(BONES), len(bpy.data.actions)))


def M_axes(x, y, z):
    return np.stack([nrm(x), nrm(y), nrm(z)], 1)


def M_from(axis, hint=(0, 0, 1)):
    """局部 z = axis，x 尽量贴近 hint×axis"""
    z = nrm(axis)
    x = np.cross(A(hint), z)
    if np.linalg.norm(x) < 1e-6:
        x = np.cross((1, 0, 0), z)
    x = nrm(x)
    return M_axes(x, np.cross(z, x), z)


# 躯干放样（与原脚本 BODY 一致，骨甲贴着它长）
TPTS = catmull([(0, y, z) for y, z, _, _ in BODY], 3)
TRX = interp([b[2] for b in BODY], len(TPTS))
TRY = interp([b[3] for b in BODY], len(TPTS))


def torso_d(P):
    return sd_loft(P, TPTS, TRX, TRY)


def theta_of(P):
    """绕躯干中轴的角度（0 = 脊线，+ = 左 +X）"""
    zc = np.interp(P[:, 1], [b[0] for b in BODY][::-1], [b[1] for b in BODY][::-1])
    return np.arctan2(P[:, 0], P[:, 2] - zc), zc


# =============================================================================================
# 基础体（fur_qing）：躯干 + 肌肉 + 四肢 + 头 + 尾芯
# =============================================================================================
def paw(g, c, part):
    c = A(c)
    g.ellipsoid(c, (0.085, 0.11, 0.052), k=0.03, part=part)
    toes = []
    for dx in (-0.056, -0.019, 0.019, 0.056):
        tc = c + A((dx, -0.085 - (0.014 if abs(dx) < 0.03 else 0), -0.008))
        g.ellipsoid(tc, (0.029, 0.038, 0.034), k=0.016, part=part)
        toes.append(tc)
    return toes


CLAWS = []  # (pts, radii, part)


def add_base(g):
    g.loft(TPTS, TRX, TRY, part="body")
    g.ellipsoid((0, -0.3, 0.9), (0.255, 0.34, 0.31), k=0.12, part="body")          # 胸廓
    g.ellipsoid((0, -0.52, 0.76), (0.15, 0.17, 0.2), k=0.1, part="body")           # 胸骨前凸
    g.ellipsoid((0, 0.2, 0.56), (0.32, 0.3, 0.13), k=0.12, op="sub")               # 收腹
    for s in (1, -1):
        x = LX * s
        t = "L" if s > 0 else "R"
        g.ellipsoid((0.165 * s, -0.42, 1.03), (0.1, 0.2, 0.23), M=M_axes((1, 0, 0), (0, math.cos(0.35), -math.sin(0.35)), (0, math.sin(0.35), math.cos(0.35))), k=0.08, part="body")  # 肩胛
        fl = catmull([(x * 0.85, -0.42, 0.9), (x, -0.42, 0.7), (x * 1.04, -0.43, 0.48), (x * 1.04, -0.45, 0.28), (x * 1.04, -0.48, 0.12), (x * 1.04, -0.5, 0.06)], 2)
        g.chain(fl, interp([0.15, 0.125, 0.085, 0.064, 0.056, 0.058], len(fl)), k=0.05, part="fleg_" + t)
        g.ellipsoid((x * 1.03, -0.41, 0.72), (0.12, 0.15, 0.2), k=0.07, part="fleg_" + t)   # 三角肌 / 肱三头肌
        g.ellipsoid((x * 1.04, -0.465, 0.39), (0.066, 0.07, 0.13), k=0.05, part="fleg_" + t)  # 前臂肌
        g.ellipsoid((x * 1.05, -0.355, 0.5), (0.055, 0.06, 0.07), k=0.04, part="fleg_" + t)  # 肘尖
        g.ellipsoid((x * 1.04, -0.43, 0.14), (0.045, 0.045, 0.05), k=0.03, part="fpaw_" + t)  # 腕垫
        for tc in paw(g, (x * 1.04, -0.55, 0.054), "fpaw_" + t):
            b = tc + A((0, -0.026, 0.008))
            CLAWS.append(([b, b + A((0, -0.035, -0.006)), b + A((0, -0.058, -0.04))], [0.015, 0.01, 0.002], "fpaw_" + t))
        hl = catmull([(x * 0.8, 0.52, 0.9), (x, 0.44, 0.68), (x * 1.06, 0.38, 0.5), (x * 1.06, 0.5, 0.34), (x * 1.06, 0.6, 0.22), (x * 1.06, 0.58, 0.13), (x * 1.06, 0.55, 0.06)], 2)
        g.chain(hl, interp([0.16, 0.13, 0.088, 0.062, 0.05, 0.046, 0.048], len(hl)), k=0.05, part="hleg_" + t)
        g.ellipsoid((x * 0.93, 0.46, 0.76), (0.13, 0.21, 0.22), k=0.08, part="hleg_" + t)   # 大腿
        g.ellipsoid((x * 1.05, 0.45, 0.42), (0.065, 0.09, 0.12), k=0.05, part="hleg_" + t)  # 小腿肚
        g.ellipsoid((x * 1.06, 0.635, 0.24), (0.038, 0.05, 0.05), k=0.03, part="hleg_" + t)  # 跗关节
        for tc in paw(g, (x * 1.06, 0.5, 0.05), "hpaw_" + t):
            b = tc + A((0, -0.026, 0.008))
            CLAWS.append(([b, b + A((0, -0.03, -0.006)), b + A((0, -0.05, -0.036))], [0.013, 0.009, 0.002], "hpaw_" + t))
    nk = catmull([(0, -0.5, 0.98), (0, -0.72, 1.08), (0, -0.88, 1.15), (0, -0.98, 1.19)], 2)
    g.loft(nk, interp([0.2, 0.19, 0.16, 0.14], len(nk)), interp([0.25, 0.22, 0.18, 0.15], len(nk)), k=0.08, part="neck")
    # ---- 头 ----
    g.ellipsoid((0, -1.0, 1.235), (0.148, 0.165, 0.128), k=0.06, part="head")     # 颅
    g.ellipsoid((0, -0.93, 1.19), (0.14, 0.12, 0.12), k=0.06, part="head")        # 后脑 / 颈接
    for s in (1, -1):
        g.ellipsoid((0.112 * s, -1.1, 1.17), (0.058, 0.09, 0.052), k=0.05, part="head")    # 颧弓
        g.ellipsoid((0.074 * s, -1.14, 1.283), (0.058, 0.055, 0.03), M=M_axes((1, 0, 0), (0, 1, -0.25 * 0), (0, 0, 1)), k=0.035, part="head")  # 眉弓（压在眼上）
    mz = [(0, -1.08, 1.2), (0, -1.22, 1.17), (0, -1.35, 1.135), (0, -1.46, 1.108)]
    g.loft(mz, [0.105, 0.082, 0.058, 0.036], [0.085, 0.066, 0.05, 0.034], k=0.05, part="head")  # 上吻（收尖）
    g.ellipsoid((0, -1.462, 1.132), (0.034, 0.03, 0.027), k=0.014, part="head")    # 鼻头
    g.ellipsoid((0, -1.33, 1.19), (0.028, 0.11, 0.018), k=0.03, part="head")       # 鼻梁
    for s in (1, -1):
        g.sphere((0.014 * s, -1.49, 1.127), 0.0095, op="sub", k=0.005)           # 鼻孔
        g.ellipsoid((0.11 * s, -1.155, 1.245), (0.03, 0.058, 0.025), M=eye_M(s), op="sub", k=0.012)  # 眼窝
    g.box((0, -1.32, 1.077), (0.13, 0.19, 0.011), M=M_axes((1, 0, 0), (0, 1, 0.1), (0, -0.1, 1)), rad=0.004, op="sub", k=0.008)  # 口裂
    jw = [(0, -1.06, 1.07), (0, -1.2, 1.05), (0, -1.32, 1.038), (0, -1.42, 1.033)]
    g.loft(jw, [0.09, 0.072, 0.05, 0.032], [0.046, 0.038, 0.029, 0.021], k=0.006, part="jaw")  # 下颌（与上吻之间留缝）
    for s in (1, -1):
        g.ellipsoid((0.098 * s, -1.04, 1.1), (0.058, 0.09, 0.07), k=0.045, part="head")  # 咬肌（下颌在后部接回颅骨）
        # 耳：扁椭圆截面放样 + 前面挖出耳窝
        base = A((0.115 * s, -0.975, 1.27))
        axis = nrm((0.42 * s, 0.34, 0.84))
        tip = base + axis * 0.24
        face = nrm((0.35 * s, -1, 0.05))
        X = nrm(np.cross(face, axis))
        ear = [base, base + axis * 0.1, base + axis * 0.19, tip]
        g.loft(ear, [0.066, 0.056, 0.03, 0.004], [0.03, 0.026, 0.016, 0.003], ref=X, k=0.03, part="head")
        cup = [p + face * 0.02 + axis * 0.012 for p in ear[:3]]
        g.loft(cup, [0.044, 0.038, 0.016], [0.016, 0.014, 0.008], ref=X, op="sub", k=0.01)
    # 尾芯
    tl = catmull([(0, 0.7, 0.9), (0, 0.94, 0.88), (0, 1.18, 0.78), (0, 1.38, 0.64), (0, 1.56, 0.5)], 3)
    g.chain(tl, interp([0.08, 0.12, 0.125, 0.1, 0.04], len(tl)), k=0.05, part="tail")
    return tl


def EYE_C(s):
    return A((0.1 * s, -1.152, 1.245))


def eye_M(s):
    long_ax = nrm((0.3 * s, -1.0, 0.22))
    up = nrm((0, 0.15, 1))
    side = nrm(np.cross(long_ax, up)) * s
    return M_axes(side, long_ax, np.cross(side, long_ax) * s)


# =============================================================================================
# 毛束
# =============================================================================================
FUR_STRANDS = Strands()
LIGHT_STRANDS = Strands()


def lock(g, strands, base, n, d, L, r0, part, lift=0.35, curl=0.0, flat=0.45, k=0.016, sag=0.0, tip=0.22):
    """一束扁毛：根埋进表面，沿 d（切向）伸出，梢部翘起 lift×r0、侧弯 curl"""
    base, n = A(base), nrm(n)
    d = nrm(A(d) - n * float(A(d) @ n))
    side = np.cross(n, d)
    pts = []
    for u in (0.0, 0.3, 0.62, 1.0):
        p = base + d * L * u + n * (r0 * (-0.45 + (0.55 + lift) * u ** 1.3) - sag * L * u * u) + side * curl * L * u * u
        pts.append(p)
    rw = [r0, r0 * 1.0, r0 * (0.5 + tip), r0 * tip]
    rh = [w * flat for w in rw]
    g.loft(pts, rh, rw, ref=n, k=k, part=part)
    strands.add(pts, r0)


def region_lock_params(p, n):
    """按部位返回 (间距, 长, 根半径, 毛流方向) 或 None（不长毛束）"""
    x, y, z = p
    ax = abs(x)
    if y > 0.7 or z < 0.13:
        return None
    if y < -1.08 and z > 0.98:  # 吻部、脸前：短毛，不长束
        return None
    if ax < LX * 0.75 and z < 0.66:  # 两腿之间
        return None
    th = math.atan2(x, z - body_at(min(max(y, -0.6), 0.74))[0])
    if -0.62 < y < 0.66 and abs(th) < 1.1 and n[2] > 0.3:  # 背上被骨甲盖住
        return None
    if y < -0.9 and z > 0.98:  # 头
        if n[1] < -0.55:
            return None
        return 0.042, 0.075, 0.021, (0.25 * np.sign(x), 1, -0.15)
    if -0.98 < y < -0.5 and z > 0.9 and n[2] > -0.35:  # 颈上、颈侧：长鬃层负责
        return None
    if y < -0.45 and n[1] < -0.35 and z < 1.02:  # 胸前垂毛
        return 0.06, 0.13, 0.04, (0, 0.45, -1)
    if z < 0.78 and y < 0.05 and ax > LX * 0.6:  # 前腿
        if n[1] > 0.35 and 0.36 < z < 0.66:
            return 0.06, 0.15, 0.032, (0.15 * np.sign(x), 0.8, -0.7)  # 肘后飞毛
        if z < 0.42:
            return None  # 小腿：光滑肌肉，不长束
        return 0.06, 0.09, 0.03, (0, 0.12, -1)
    if z < 0.82 and y > 0.2 and ax > LX * 0.6:  # 后腿
        if n[1] > 0.5 and z > 0.3:
            return 0.06, 0.14, 0.034, (0, 0.55, -1)
        if z < 0.45:
            return None
        return 0.06, 0.1, 0.03, (0, 0.2, -1)
    if n[2] < -0.45:  # 腹
        return 0.065, 0.1, 0.03, (0, 1, -0.25)
    if -0.95 < y < -0.45 and z > 0.85:  # 颈（大部分被长鬃盖住）
        return 0.06, 0.15, 0.036, (0.3 * np.sign(x), 1, -0.4)
    return 0.068, 0.135, 0.036, (0, 1, -0.6 * (1 - max(n[2], 0)))


def scatter_locks(g, base_group):
    D, o, h = base_group.field(band=0.0)
    V, Q = surface_nets(D, o, h, project=1)
    Nn = grad_at(D, o, h, V)
    parts, _ = base_group.eval_parts(V)
    order = list(range(len(V)))
    rnd.shuffle(order)
    acc = []
    cell = 0.04
    grid = {}
    n_ok = 0
    for i in order:
        prm = region_lock_params(V[i], Nn[i])
        if prm is None or parts[i] is None:
            continue
        sp, L, r0, f = prm
        key = tuple((V[i] // cell).astype(int))
        ok = True
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                for dz in (-2, -1, 0, 1, 2):
                    for (q, sq) in grid.get((key[0] + dx, key[1] + dy, key[2] + dz), ()):
                        if np.sum((q - V[i]) ** 2) < (0.5 * (sp + sq)) ** 2:
                            ok = False
                            break
                    if not ok:
                        break
                if not ok:
                    break
            if not ok:
                break
        if not ok:
            continue
        grid.setdefault(key, []).append((V[i], sp))
        j = rnd.uniform(0.85, 1.2)
        lock(g, FUR_STRANDS, V[i], Nn[i], f, L * j, r0 * rnd.uniform(0.95, 1.2), parts[i], lift=rnd.uniform(0.1, 0.35), curl=rnd.uniform(-0.2, 0.2), sag=0.25 * L)
        n_ok += 1
    log("fur locks: %d" % n_ok)


def add_mane(g):
    """颈后青白长鬃：三排大毛束，向后上方扬起；颊鬃；（尾梢在 add_tail）"""
    rows = [(-0.54, 15, 118, 0.62, 0.08), (-0.66, 13, 112, 0.58, 0.076), (-0.78, 11, 100, 0.5, 0.068), (-0.9, 9, 86, 0.38, 0.058)]
    for y0, n, span, L0, r0 in rows:
        zc, ax, az = 1.0 + (y0 + 0.6) * -0.6, 0.19, 0.23
        for k in range(n):
            a = math.radians(-span + 2 * span * k / (n - 1)) + rnd.uniform(-0.05, 0.05)
            out = A((math.sin(a), 0, math.cos(a)))
            base = A((math.sin(a) * ax * 0.92, y0 + rnd.uniform(-0.02, 0.02), zc + math.cos(a) * az * 0.92))
            d = A((math.sin(a) * 0.7, 0.8, math.cos(a) * 0.6 + 0.4))
            L = L0 * (0.72 + 0.28 * math.cos(a)) * rnd.uniform(0.9, 1.1)
            part = "neck"
            lock(g, LIGHT_STRANDS, base, out, d, L, r0 * rnd.uniform(0.9, 1.1), part, lift=2.2, curl=rnd.uniform(-0.25, 0.25), flat=0.45, k=0.018, tip=0.04)
    for s in (1, -1):  # 颊鬃
        for k in range(4):
            base = A((0.12 * s, -1.07 + 0.035 * k, 1.1 + 0.03 * k))
            out = nrm((s, 0.1, -0.2))
            lock(g, LIGHT_STRANDS, base, out, (0.65 * s, 0.9, -0.25 + 0.1 * k), 0.17 + 0.02 * k, 0.03, "head", lift=0.8, curl=0.1 * s, flat=0.5, k=0.01)


def add_tail(gq, gl, tl):
    T = np.gradient(tl, axis=0)
    T = nrm(T)
    for i, u in enumerate(np.linspace(0.06, 0.9, 10)):
        j = int(u * (len(tl) - 1))
        c, t = tl[j], T[j]
        side = nrm(np.cross(t, (0, 0, 1)))
        up = np.cross(side, t)
        rc = 0.1 * (1 - 0.6 * u) + 0.02
        nn = 7 if u < 0.7 else 6
        for k in range(nn):
            a = 2 * math.pi * (k + 0.5 * (i % 2)) / nn
            radial = side * math.cos(a) + up * math.sin(a)
            base = c + radial * rc * 0.75
            d = t + radial * 0.18 - A((0, 0, 0.06))
            L = (0.26 + 0.12 * math.sin(math.pi * u)) * rnd.uniform(0.9, 1.1)
            g, st = (gl, LIGHT_STRANDS) if u > 0.72 else (gq, FUR_STRANDS)
            lock(g, st, base, radial, d, L, (0.06 * (1 - 0.45 * u) + 0.014) * rnd.uniform(0.9, 1.1), "tail", lift=0.3, curl=rnd.uniform(-0.3, 0.3), flat=0.5, sag=0.1)
    tip = tl[-1]
    lock(gl, LIGHT_STRANDS, tip - T[-1] * 0.08, (0, 0, 1), T[-1], 0.2, 0.035, "tail", lift=0.2, flat=0.7)


# =============================================================================================
# 骨甲（贴体厚壳 ∩ 区域）
# =============================================================================================
def plate_fn(yc, hl, th0, th1, off, thick, keel=0.0, lift=0.0, jag=0.012, seed=0, shift=(0, 0, 0), groove=True):
    sh = A(shift)
    R = 0.3

    def fn(P):
        Q = P - sh
        th, zc = theta_of(Q)
        u = (Q[:, 1] - (yc - hl)) / (2 * hl)  # 0 = 前沿 → 1 = 后沿
        o = off + lift * np.clip(u, 0, 1) + keel * np.maximum(0, 1 - np.abs(th) / 0.45)
        td = torso_d(Q)
        shell = np.abs(td - o) - thick * 0.5
        nz = gnoise(Q * 22, seed) * jag + gnoise(Q * 55, seed + 5) * jag * 0.4
        dth = np.maximum(th0 - th, th - th1) * R
        dy = np.abs(Q[:, 1] - yc) - hl * (1 - 0.15 * ((th - (th0 + th1) / 2) / max(th1 - th0, 1e-3) * 2) ** 2)
        reg = np.maximum(dth, dy) + nz
        d = smax(shell, reg, 0.022)
        if groove:  # 内沿刻线：距边 0.035 的一圈细沟，只刻外表面
            outer = np.abs(td - (o + thick * 0.5)) - 0.007
            g1 = np.abs(reg + 0.036) - 0.0042
            d = smax(d, -smax(g1, outer, 0.003), 0.004)
            # 横向生长纹两道
            for gy in (0.25,):
                g2 = np.abs(Q[:, 1] - (yc + gy * hl) - 0.01 * gnoise(Q * 9, seed + 9)) - 0.003
                d = smax(d, -smax(smax(g2, outer, 0.003), reg + 0.05, 0.004), 0.003)
        return d

    return fn


def plate_bounds(yc, hl, extra=0.12):
    zc, ax, az = body_at(yc)
    return (-(ax + extra), yc - hl - 0.06, zc - 0.1), ((ax + extra), yc + hl + 0.06, zc + az + extra + 0.08)


PLATES = [(0.47, 0.115, 0.17), (0.2, 0.125, 0.2), (-0.1, 0.13, 0.24), (-0.4, 0.13, 0.26)]  # (中心 y, 半长, 脊刺长)


def add_armor(g):
    for i, (yc, hl, sp) in enumerate(PLATES):
        lo, hi = plate_bounds(yc, hl)
        g.add(plate_fn(yc, hl, -1.08, 1.08, 0.06, 0.05, keel=0.04, lift=0.045, seed=i), lo, hi, part="body")
        zc, ax, az = body_at(yc)
        b = A((0, yc + 0.04, zc + az + 0.09))
        g.chain([b - A((0, 0, 0.05)), b + A((0, 0.05, 0.08)) * sp / 0.2, b + A((0, 0.13, 0.15)) * sp / 0.2, b + A((0, 0.22, 0.17)) * sp / 0.2],
                [0.042, 0.03, 0.016, 0.002], k=0.02, part="body")


def add_crack_plates(g, glow):
    for i, (yc, hl, sp) in enumerate(PLATES):
        lo, hi = plate_bounds(yc, hl, 0.16)
        for s in (1, -1):
            sh = (0.035 * s, rnd.uniform(-0.015, 0.015), 0.012)
            th0, th1 = (0.24, 1.2) if s > 0 else (-1.2, -0.24)
            g.add(plate_fn(yc, hl * 0.95, th0, th1, 0.065, 0.05, keel=0.0, lift=0.04, jag=0.02, seed=20 + i * 2 + (s > 0), shift=sh), lo, hi, part="body")
            # 板面裂纹：沿板面走的折线，刻出沟、沟底埋发光脉
            zc, ax, az = body_at(yc)
            pts = []
            th = 0.3 * s
            y = yc + rnd.uniform(-0.5, 0.5) * hl
            for k in range(5):
                r = (ax + az) / 2 + 0.07
                pts.append(A((math.sin(th) * (ax + 0.1), y, zc + math.cos(th) * (az + 0.1))) + A(sh))
                th += 0.2 * s
                y += rnd.uniform(-0.6, 0.6) * hl * 0.4
            pts = A(pts)
            # 投影到骨板外表面（沿径向）
            pts = project_to_offset(pts, 0.075 + 0.025, A(sh))
            g.chain(pts, [0.012] * len(pts), op="sub", k=0.006)
            glow.chain(project_to_offset(pts, 0.075 + 0.006, A(sh)), [0.011] * len(pts), k=0.004, part="body")
    # 脊线中缝的青光：锯齿带
    cr = []
    for i in range(15):
        y = lerp(0.64, -0.6, i / 14)
        zc, ax, az = body_at(y)
        cr.append((0.018 * (1 if i % 2 else -1), y, zc + az + 0.035))
    glow.chain(cr, [0.012, 0.018, 0.02, 0.018, 0.022, 0.018, 0.02, 0.018, 0.022, 0.018, 0.02, 0.018, 0.018, 0.015, 0.01], k=0.008, part="body")


def project_to_offset(pts, off, sh):
    out = []
    for p in pts:
        q = p - sh
        zc, ax, az = body_at(float(np.clip(q[1], -0.6, 0.74)))
        dirv = nrm(A((q[0] / ax, 0, (q[2] - zc) / az)))
        # 沿截面径向找 torso_d = off 的点
        c = A((0, q[1], zc))
        lo_, hi_ = 0.0, 1.0
        for _ in range(30):
            m = (lo_ + hi_) / 2
            if torso_d((c + dirv * m)[None])[0] < off:
                lo_ = m
            else:
                hi_ = m
        out.append(c + dirv * lo_ + sh)
    return A(out)


def add_bone_main(g):
    """主网格上的骨：头冠 + 双角 + 双肩甲 + 爪"""
    crown = [(0, -1.32, 1.205), (0, -1.2, 1.262), (0, -1.08, 1.32), (0, -0.96, 1.335), (0, -0.86, 1.3)]
    g.loft(crown, [0.022, 0.05, 0.08, 0.072, 0.035], [0.012, 0.02, 0.032, 0.03, 0.018], k=0.01, part="head")
    g.chain([(0, -1.26, 1.25), (0, -1.08, 1.35), (0, -0.92, 1.36)], [0.008, 0.02, 0.01], k=0.012, part="head")  # 冠脊
    for s in (1, -1):
        hp = catmull([(0.075 * s, -0.98, 1.33), (0.16 * s, -0.86, 1.44), (0.25 * s, -0.69, 1.49), (0.3 * s, -0.55, 1.46), (0.31 * s, -0.47, 1.41)], 3)
        hr = interp([0.046, 0.036, 0.024, 0.012, 0.003], len(hp))
        g.chain(hp, hr, k=0.015, part="head")
        T = nrm(np.gradient(hp, axis=0))
        for j in range(1, len(hp) - 3, 2):  # 角上的环纹
            g.ellipsoid(hp[j], (hr[j] * 1.13, hr[j] * 1.13, hr[j] * 0.3), M=M_from(T[j]), k=0.006, part="head")
        lo, hi = plate_bounds(-0.4, 0.2, 0.2)
        th0, th1 = (0.55, 1.45) if s > 0 else (-1.45, -0.55)
        g.add(plate_fn(-0.4, 0.17, th0, th1, 0.07, 0.048, seed=40 + (s > 0)), lo, hi, part="body")
        g.add(plate_fn(-0.17, 0.09, th0 * 1.05, th1 * 0.98, 0.065, 0.04, seed=44 + (s > 0)), lo, (hi[0], hi[1] + 0.3, hi[2]), part="body")
    for pts, rr, part in CLAWS:
        g.chain(pts, rr, k=0.004, part=part)


def add_fangs(g):
    for s in (1, -1):
        p0 = A((0.055 * s, -1.35, 1.045))
        d = nrm((0.5 * s, -0.3, 1))
        g.chain([p0 - d * 0.03, p0 + d * 0.07, p0 + d * 0.14 + A((0.012 * s, 0.012, 0)), p0 + d * 0.2 + A((0.022 * s, 0.035, -0.005))], [0.026, 0.022, 0.013, 0.002], k=0.006, part="jaw")
        q0 = A((0.05 * s, -1.42, 1.11))
        g.chain([q0, q0 + A((0.004 * s, -0.012, -0.06)), q0 + A((0.008 * s, -0.01, -0.12))], [0.02, 0.014, 0.002], k=0.004, part="head")
        for k in range(3):  # 小门齿 / 前臼齿
            g.cone((0.03 * s * (k + 0.4), -1.47 + 0.05 * k, 1.098), (0.03 * s * (k + 0.4), -1.47 + 0.05 * k, 1.072), 0.008, 0.002, part="head")


def add_eyes(g):
    for s in (1, -1):
        g.ellipsoid(EYE_C(s), (0.019, 0.046, 0.016), M=eye_M(s), part="head")


def add_eyefire(g):
    for s in (1, -1):
        e = A((0.104 * s, -1.142, 1.255))
        g.chain([e, e + A((0.03 * s, 0.06, 0.035)), e + A((0.05 * s, 0.15, 0.085)), e + A((0.055 * s, 0.27, 0.11))], [0.02, 0.018, 0.01, 0.002], k=0.01, part="head")
        g.chain([e, e + A((0.045 * s, 0.05, 0.0)), e + A((0.08 * s, 0.13, 0.02)), e + A((0.1 * s, 0.2, 0.0))], [0.014, 0.012, 0.007, 0.001], k=0.01, part="head")


# =============================================================================================
# 组装
# =============================================================================================
base = Group("base", 0.02)
TL = add_base(base)
CLAWS.clear()
fur = Group("fur_qing", H)
add_base(fur)
scatter_locks(fur, base)
light = Group("fur_light", H)
add_mane(light)
add_tail(fur, light, TL)
bone = Group("bone", H * 0.8, mat="bone_armor")
add_bone_main(bone)
fang = Group("fang", H * 0.6, mat="fang_jade")
add_fangs(fang)
eye = Group("eye", H * 0.5, mat="eye_jade")
add_eyes(eye)
armor = Group("armor", H * 0.8, mat="bone_armor")
add_armor(armor)
armor.disp(lambda P, N: -0.004 * np.clip(0.35 - worley(P * 22, 7)[0], 0, 1) ** 2 * 8)  # 稀疏麻点
crack = Group("crack", H * 0.8, mat="bone_armor")
glow = Group("glow", H * 0.8, mat="crack_glow")
add_crack_plates(crack, glow)
crack.disp(lambda P, N: -0.004 * np.clip(0.35 - worley(P * 22, 8)[0], 0, 1) ** 2 * 8)
efire = Group("eyefire", H * 0.6, mat="eye_fire")
add_eyefire(efire)

GROUPS = [fur, light, bone, fang, eye, armor, crack, glow, efire]
OBJ_OF = {"fur_qing": "qingya", "fur_light": "qingya", "bone": "qingya", "fang": "qingya", "eye": "qingya",
          "armor": "qingya_armor", "crack": "qingya_crack", "glow": "qingya_crack", "eyefire": "qingya_eyefire"}
TARGET = {"fur_qing": 6200, "fur_light": 2200, "bone": 1300, "fang": 220, "eye": 120, "armor": 1500, "crack": 1700, "glow": 260, "eyefire": 160}

SRGB = lambda hx: A([((hx >> 16) & 255) / 255.0, ((hx >> 8) & 255) / 255.0, (hx & 255) / 255.0])
LIN = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
C = lambda hx: LIN(SRGB(hx))
INK = C(0x1a1f1e)


def paint(gname, P, N, ao, cav):
    """返回 (固有色 linear (n,3), 墨 (n,), 粗糙度 (n,), 金属度 (n,))"""
    n = len(P)
    ink = np.zeros(n)
    rough = np.full(n, 0.85)
    metal = np.zeros(n)
    groove = sstep(0.8, 2.6, -cav)
    ridge = sstep(0.8, 2.6, cav)
    if gname in ("fur_qing", "fur_light"):
        st = FUR_STRANDS if gname == "fur_qing" else LIGHT_STRANDS
        t, sid, dd = st.query(P)
        tip = np.where(t >= 0, sstep(0.35, 1.0, t), 0.0)
        root = np.where(t >= 0, 1 - sstep(0.0, 0.4, t), 1.0)
        rid = np.where(sid >= 0, hash01(sid, 3), 0.5)
        if gname == "fur_qing":
            back = sstep(-0.2, 0.6, N[:, 2]) * sstep(0.3, 0.9, P[:, 2])
            belly = sstep(0.1, -0.6, N[:, 2]) * sstep(1.0, 0.7, P[:, 2]) + sstep(-0.3, -0.75, N[:, 1]) * sstep(1.05, 0.7, P[:, 2]) * (P[:, 1] < -0.4)
            belly = np.clip(belly, 0, 1)
            col = C(0x63736c) * (1 - back[:, None] * 0.25)
            col = col * (1 - belly[:, None]) + C(0x8b9993) * belly[:, None]
            sock = sstep(0.3, 0.1, P[:, 2])
            col = col * (1 - 0.45 * sock[:, None])
            muzzle = sstep(-1.25, -1.4, P[:, 1]) * sstep(1.0, 1.08, P[:, 2])
            col = col * (1 - muzzle[:, None]) + C(0x8f9c96) * muzzle[:, None]
            nose = np.clip(1 - np.linalg.norm((P - A((0, -1.49, 1.142))) / A((0.05, 0.04, 0.036)), axis=1), 0, 1) ** 0.5
            col = col * (1 - nose[:, None]) + C(0x14181a) * nose[:, None]
            # 眼周墨纹：从眼角拖向耳根的一笔
            for s in (1, -1):
                d_, t_ = polyline_dt(P, [(0.1 * s, -1.2, 1.25), (0.12 * s, -1.08, 1.27), (0.13 * s, -0.98, 1.285)])
                ink = np.maximum(ink, sstep(0.03, 0.012, d_) * (1 - 0.6 * t_))
            mouth = sstep(0.012, 0.0, np.abs(P[:, 2] - 1.087)) * sstep(-1.1, -1.18, P[:, 1]) * sstep(0.13, 0.09, np.abs(P[:, 0]))
            ink = np.maximum(ink, mouth)
            # 背上顺毛长笔（淡墨）
            streak = sstep(0.35, 0.75, fbm(P * A((9, 1.6, 9)), 3, seed=11) * 0.5 + 0.5) * back
            ink = np.maximum(ink, streak * 0.45)
        else:
            col = C(0xa9c7b8) * (0.78 + 0.3 * tip[:, None]) * (0.92 + 0.12 * rid[:, None])
            col = col * (1 - 0.35 * root[:, None])
        # 毛束：梢亮根暗、束间凹缝墨线
        col = col * (0.88 + 0.22 * tip[:, None]) * (0.9 + 0.15 * rid[:, None])
        ink = np.maximum(ink, groove * 0.85)
        rough[:] = 0.9
    elif gname in ("bone", "armor", "crack"):
        col = np.repeat(C(0xd9d5c5)[None], n, 0)
        stain = sstep(0.1, 0.8, fbm(P * 7, 3, seed=21) * 0.5 + 0.5)
        col = col * (1 - 0.18 * stain[:, None])
        col = col * (1 - 0.15 * (1 - ao)[:, None])
        ink = np.maximum(groove, 0.35 * sstep(0.55, 0.85, fbm(P * A((4, 20, 4)), 3, seed=23) * 0.5 + 0.5))
        col = col * (1 + 0.08 * ridge[:, None])
        rough[:] = 0.62
    elif gname == "fang":
        tt = sstep(1.05, 1.3, P[:, 2]) if True else 0
        col = C(0x6fe3b8) * (0.75 + 0.35 * tt[:, None])
        rough[:] = 0.35
        ink = groove * 0.5
    elif gname == "eye":
        col = np.repeat(C(0xa8ffe0)[None], n, 0)
        # 竖瞳
        for s in (1, -1):
            c0 = EYE_C(s)
            q = (P - c0) @ eye_M(s)
            slit = sstep(0.007, 0.0025, np.abs(q[:, 1])) * sstep(0.0, 0.01, q[:, 0]) * (np.sign(P[:, 0]) == s)
            ink = np.maximum(ink, slit)
        col = col * (1 - 0.85 * ink[:, None])
        rough[:] = 0.2
    elif gname == "glow":
        col = np.repeat(C(0x8affd0)[None], n, 0)
        rough[:] = 0.5
    else:  # eyefire
        col = np.repeat(C(0xd2fff0)[None], n, 0)
        rough[:] = 0.5
    # 缝隙积灰（只给固有色，PBR 用）+ 墨
    col = col * (1 - 0.35 * groove[:, None])
    col = col * (1 - 0.55 * ink[:, None]) + INK * 0.55 * ink[:, None]
    return np.clip(col, 0, 1), np.clip(ink, 0, 1), rough, metal



def face_mat_names(gname, lo):
    me = lo.data
    nf = len(me.polygons)
    if gname == "fur_qing":
        c = np.empty(nf * 3, np.float32)
        me.polygons.foreach_get("center", c)
        c = c.reshape(-1, 3)
        nn = np.empty(nf * 3, np.float32)
        me.polygons.foreach_get("normal", nn)
        nn = nn.reshape(-1, 3)
        belly = sstep(0.1, -0.6, nn[:, 2]) * sstep(1.0, 0.7, c[:, 2]) + sstep(-0.3, -0.75, nn[:, 1]) * sstep(1.05, 0.7, c[:, 2]) * (c[:, 1] < -0.4)
        return np.where(belly > 0.5, "fur_belly", "fur_qing")
    one = {"fur_light": "fur_light", "bone": "bone_armor", "armor": "bone_armor", "crack": "bone_armor", "fang": "fang_jade", "eye": "eye_jade",
           "glow": "crack_glow", "eyefire": "eye_fire"}[gname]
    return np.array([one] * nf)


P1, P2 = ["armor"], ["crack", "glow", "eyefire"]
HIDE_FOR = {g.name: (P2 if g.name in P1 else (P1 if g.name in P2 else P2)) for g in GROUPS}
MAIN = ["fur_qing", "fur_light", "bone", "fang", "eye"]
run_pipeline(dict(
    name=NAME, groups=GROUPS, arm=ARM, bones=BONES, part_bones=PART_BONES, weight=dict(power=4, eps=0.01, top=3),
    paint=paint, face_mats=face_mat_names,
    pal_emit={"fang_jade": ((0.03, 0.7, 0.28), 0.6), "eye_jade": ((0.05, 1.0, 0.45), 2.0), "crack_glow": ((0.03, 0.8, 0.35), 2.0), "eye_fire": ((0.15, 1.0, 0.55), 2.5)},
    obj_of=OBJ_OF, out_objs=["qingya", "qingya_armor", "qingya_crack", "qingya_eyefire"], target=TARGET,
    density={"eye": 2.5, "fang": 1.6, "bone": 1.2, "eyefire": 0.6, "glow": 0.6},
    ao_dist=0.1, hide_for=HIDE_FOR, res=RES, extrusion=0.012, max_dist=0.04,
    smooth={"fur_qing": 6, "fur_light": 6},
    previews=[("qingya_v2_hi.png", MAIN + ["armor"], [(90, 8, 1.0), (0, 8, 1.0), (-130, 40, 1.0), (60, 15, 2.4)]),
              ("qingya_v2_head.png", MAIN + ["armor"], [(60, 10, 3.2, (0, -1.15, 1.2)), (0, 5, 3.2, (0, -1.15, 1.2)), (130, 35, 2.2, (0, -0.8, 1.1))]),
              ("qingya_v2_hi_p2.png", MAIN + P2, [(-130, 40, 1.0), (60, 15, 2.4)])],
    only_hi=ONLY_HI, quick=QUICK,
))
