# 墨途 · 精细化小样 v1：纯 numpy 的 SDF 建模 + Surface Nets 网格化（不依赖 bpy，可单测）
#
# 思路（与 Inigo Quilez 的 SDF 建模同一路数）：每个部件是一组带符号距离场图元（圆锥胶囊 / 椭球 / 放样管 / 圆角盒），
# 用多项式 smooth-min 平滑融合成连续形体（不是"几何体拼接"），再在窄带里叠加程序化位移（毛团、肌肉、褶皱、骨纹），
# 最后用 Surface Nets 抽等值面、沿梯度投影到零面，得到高模。
# 参考：https://iquilezles.org/articles/distfunctions/ 、https://iquilezles.org/articles/smin/ 、
#       Surface Nets：https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/
import math
import numpy as np

F = np.float64


def A(v):
    return np.asarray(v, dtype=F)


def nrm(v):
    v = A(v)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


def lerp(a, b, t):
    return a + (b - a) * t


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- 噪声
_G = A([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
        [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1]])


def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 1013904223 + 12345)
    h = h ^ (h >> 13)
    h = h * 1274126177
    h = h ^ (h >> 16)
    return h & 0x7FFFFFFF


def gnoise(P, seed=0):
    """3D 梯度噪声（Perlin 式，五次插值），返回约 [-1, 1]"""
    P = A(P)
    i = np.floor(P)
    f = P - i
    i = i.astype(np.int64)
    u = f * f * f * (f * (f * 6 - 15) + 10)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                g = _G[_hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed) & 15]
                d = (f[:, 0] - dx) * g[:, 0] + (f[:, 1] - dy) * g[:, 1] + (f[:, 2] - dz) * g[:, 2]
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                out = out + w * d
    return out


def fbm(P, octaves=4, seed=0, lac=2.03, gain=0.5):
    P = A(P)
    s, a, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        s = s + a * gnoise(P * (lac ** o), seed + o * 31)
        tot += a
        a *= gain
    return s / tot


def worley(P, seed=0):
    """细胞噪声：返回 (F1, F2, 细胞 id)"""
    P = A(P)
    i = np.floor(P).astype(np.int64)
    f1 = np.full(len(P), 9.0)
    f2 = np.full(len(P), 9.0)
    cid = np.zeros(len(P), np.int64)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c = i + np.array([dx, dy, dz])
                h = _hash(c[:, 0], c[:, 1], c[:, 2], seed)
                jit = np.stack([(h & 1023) / 1023.0, ((h >> 10) & 1023) / 1023.0, ((h >> 20) & 1023) / 1023.0], 1)
                d = np.linalg.norm(c + jit - P, axis=1)
                lt1 = d < f1
                f2 = np.where(lt1, f1, np.minimum(f2, d))
                cid = np.where(lt1, h, cid)
                f1 = np.where(lt1, d, f1)
    return f1, f2, cid


def hash01(n, seed=0):
    n = np.asarray(n, np.int64)
    return (_hash(n, n * 7 + 3, n * 13 + 5, seed) & 0xFFFF) / 65535.0


# ---------------------------------------------------------------- 距离场图元
def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def sd_round_cone(P, a, b, r1, r2):
    """两端半径不同的胶囊（IQ sdRoundCone，精确）"""
    a, b = A(a), A(b)
    ba = b - a
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    w = pa * l2 - y[:, None] * ba
    x2 = np.einsum("ij,ij->i", w, w)
    y2 = y * y * l2
    z2 = z * z * l2
    k = math.copysign(1.0, rr) * rr * rr * x2
    d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d1 = np.sqrt(x2 + z2) * il2 - r2
    d2 = np.sqrt(x2 + y2) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d1, np.where(np.sign(y) * a2 * y2 < k, d2, d3))


def sd_ellipsoid(P, c, r, M=None):
    """椭球（IQ 近似，表面附近准确）。M：3×3，列为局部轴（世界坐标）"""
    q = P - A(c)
    if M is not None:
        q = q @ A(M)
    r = A(r)
    k0 = np.linalg.norm(q / r, axis=1)
    k1 = np.linalg.norm(q / (r * r), axis=1)
    return np.where(k1 > 1e-9, k0 * (k0 - 1.0) / np.maximum(k1, 1e-9), -r.min())


def sd_box(P, c, half, M=None, rad=0.0):
    q = P - A(c)
    if M is not None:
        q = q @ A(M)
    q = np.abs(q) - (A(half) - rad)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0) - rad


def frames(pts, ref):
    """沿折线的 (T, X, Y) 坐标系；ref 为截面 X 方向参考（单个向量或每点一个）"""
    pts = A(pts)
    n = len(pts)
    T = np.zeros_like(pts)
    T[1:-1] = pts[2:] - pts[:-2]
    T[0] = pts[1] - pts[0]
    T[-1] = pts[-1] - pts[-2]
    T = nrm(T)
    R = A(ref)
    if R.ndim == 1:
        R = np.repeat(R[None], n, 0)
    X = R - T * np.sum(R * T, 1, keepdims=True)
    X = nrm(X)
    Y = np.cross(T, X)
    return T, X, Y


def catmull(pts, sub):
    pts = [A(p) for p in pts]
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[max(i - 1, 0)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(i + 2, n - 1)]
        for s in range(sub):
            t = s / sub
            t2, t3 = t * t, t * t * t
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return A(out)


def interp(vals, n):
    vals = A(vals)
    x = np.linspace(0, 1, len(vals))
    return np.interp(np.linspace(0, 1, n), x, vals)


def sd_loft(P, pts, rx, ry, ref=(1, 0, 0), caps=True):
    """椭圆截面放样管：沿折线逐段取最近点，截面半径与坐标系线性插值（近似距离，表面附近准确）。
    rx 沿 ref（X）方向，ry 沿 T×X（Y）方向"""
    pts = A(pts)
    n = len(pts)
    rx = A(rx) if np.ndim(rx) else np.full(n, float(rx))
    ry = A(ry) if np.ndim(ry) else np.full(n, float(ry))
    T, X, Y = frames(pts, ref)
    d = np.full(len(P), 1e9)
    for i in range(n - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        L2 = float(ab @ ab)
        if L2 < 1e-12:
            continue
        t_raw = ((P - a) @ ab) / L2
        # 中间段允许向两侧外推半段（半径 / 坐标系线性外推），避免张开的管子在段接缝处出现一圈圈的沟；只有两端真正封口
        t0 = 0.0 if i == 0 else -0.5
        t1 = 1.0 if i == n - 2 else 1.5
        t = np.clip(t_raw, t0, t1)
        c = a + t[:, None] * ab
        Xi = nrm(X[i] + (X[i + 1] - X[i]) * t[:, None])
        Yi = nrm(Y[i] + (Y[i + 1] - Y[i]) * t[:, None])
        q = P - c
        qx = np.einsum("ij,ij->i", q, Xi)
        qy = np.einsum("ij,ij->i", q, Yi)
        r1 = np.maximum(rx[i] + (rx[i + 1] - rx[i]) * t, 1e-5)
        r2 = np.maximum(ry[i] + (ry[i + 1] - ry[i]) * t, 1e-5)
        k0 = np.sqrt((qx / r1) ** 2 + (qy / r2) ** 2)
        k1 = np.sqrt((qx / r1 ** 2) ** 2 + (qy / r2 ** 2) ** 2)
        de = np.where(k1 > 1e-9, k0 * (k0 - 1) / np.maximum(k1, 1e-9), -np.minimum(r1, r2))
        ax = (t_raw - t) * math.sqrt(L2)
        free_end = ((i == 0) & (t_raw < 0)) | ((i == n - 2) & (t_raw > 1))
        if caps:
            capd = np.where(de > 0, np.sqrt(de * de + ax * ax), np.maximum(de, np.abs(ax) - np.minimum(r1, r2)))
        else:
            capd = np.maximum(de, np.abs(ax))
        de = np.where(np.abs(ax) > 0, np.where(free_end, capd, 1e9), de)
        d = np.minimum(d, de)
    return d


# ---------------------------------------------------------------- 组：图元列表 → 网格距离场
class Prim:
    __slots__ = ("fn", "lo", "hi", "k", "op", "part", "tag")

    def __init__(self, fn, lo, hi, k, op, part, tag):
        self.fn, self.lo, self.hi, self.k, self.op, self.part, self.tag = fn, A(lo), A(hi), k, op, part, tag


class Group:
    """一个材质组（一个连续表面）：按顺序 add / sub / inter 图元，最后加位移"""

    def __init__(self, name, h, mat=None):
        self.name, self.h, self.mat = name, h, mat or name
        self.prims = []
        self.disps = []  # (fn(P, N) -> 位移（外正）, lo, hi)
        self.extra_bounds = None

    # 通用
    def add(self, fn, lo, hi, k=0.0, op="add", part=None, tag=None):
        self.prims.append(Prim(fn, lo, hi, k, op, part, tag))
        return self

    def sphere(self, c, r, **kw):
        c = A(c)
        return self.add(lambda P: np.linalg.norm(P - c, axis=1) - r, c - r, c + r, **kw)

    def cone(self, a, b, r1, r2, **kw):
        a, b = A(a), A(b)
        lo = np.minimum(a - r1, b - r2)
        hi = np.maximum(a + r1, b + r2)
        return self.add(lambda P: sd_round_cone(P, a, b, r1, r2), lo, hi, **kw)

    def ellipsoid(self, c, r, M=None, **kw):
        c = A(c)
        R = float(np.max(r))
        return self.add(lambda P: sd_ellipsoid(P, c, r, M), c - R, c + R, **kw)

    def box(self, c, half, M=None, rad=0.0, **kw):
        c = A(c)
        R = float(np.linalg.norm(half))
        return self.add(lambda P: sd_box(P, c, half, M, rad), c - R, c + R, **kw)

    def loft(self, pts, rx, ry, ref=(1, 0, 0), caps=True, **kw):
        pts = A(pts)
        R = float(max(np.max(rx), np.max(ry)))
        return self.add(lambda P: sd_loft(P, pts, rx, ry, ref, caps), pts.min(0) - R, pts.max(0) + R, **kw)

    def chain(self, pts, radii, **kw):
        """圆锥胶囊链（圆截面），比 loft 准确，适合毛束、发丝、尾巴"""
        pts = A(pts)
        radii = A(radii)
        R = float(radii.max())

        def fn(P):
            d = np.full(len(P), 1e9)
            for i in range(len(pts) - 1):
                if np.linalg.norm(pts[i + 1] - pts[i]) < 1e-6:
                    continue
                d = np.minimum(d, sd_round_cone(P, pts[i], pts[i + 1], radii[i], radii[i + 1]))
            return d

        return self.add(fn, pts.min(0) - R, pts.max(0) + R, **kw)

    def disp(self, fn, lo=None, hi=None):
        self.disps.append((fn, None if lo is None else A(lo), None if hi is None else A(hi)))
        return self

    # 求值
    def bounds(self, margin):
        lo = np.min([p.lo for p in self.prims if p.op == "add"], 0) - margin
        hi = np.max([p.hi for p in self.prims if p.op == "add"], 0) + margin
        return lo, hi

    def field(self, band=None, log=print):
        """在规则网格上求距离场：返回 (D, origin, h)。band = 位移最大幅度（窄带外不算位移）"""
        h = self.h
        maxk = max([p.k for p in self.prims] + [0])
        band = band if band is not None else 4 * h
        lo, hi = self.bounds(maxk + band + 3 * h)
        n = np.ceil((hi - lo) / h).astype(int) + 1
        D = np.full(tuple(n), 1.0, np.float32)
        log("[sdf] %-14s grid %s = %.1fM voxels, %d prims" % (self.name, tuple(n), np.prod(n) / 1e6, len(self.prims)))
        for p in self.prims:
            m = p.k + 3 * h + band
            i0 = np.clip(np.floor((p.lo - m - lo) / h).astype(int), 0, n - 1)
            i1 = np.clip(np.ceil((p.hi + m - lo) / h).astype(int) + 1, 1, n)
            if np.any(i1 <= i0):
                continue
            xs = [lo[a] + h * np.arange(i0[a], i1[a]) for a in range(3)]
            G = np.stack(np.meshgrid(*xs, indexing="ij"), -1).reshape(-1, 3)
            d = p.fn(G).reshape(tuple(i1 - i0))
            sl = tuple(slice(i0[a], i1[a]) for a in range(3))
            cur = D[sl].astype(F)
            if p.op == "add":
                cur = smin(cur, d, p.k)
            elif p.op == "sub":
                cur = smax(cur, -d, p.k)
            elif p.op == "inter":
                cur = smax(cur, d, p.k)
            D[sl] = cur
        if self.disps:
            idx = np.nonzero(np.abs(D) < band + 2 * h)
            P = lo + np.stack(idx, 1) * h
            N = grad_at(D, lo, h, P)
            tot = np.zeros(len(P))
            for fn, dlo, dhi in self.disps:
                if dlo is not None:
                    sel = np.all((P >= dlo) & (P <= dhi), 1)
                    if sel.any():
                        tot[sel] += fn(P[sel], N[sel])
                else:
                    tot += fn(P, N)
            D[idx] = (D[idx] - tot).astype(np.float32)
        return D, lo, h

    def eval_parts(self, P):
        """逐点：最近的 add 图元的 part（用于蒙皮分区）和对应距离"""
        best = np.full(len(P), 1e9)
        part = np.empty(len(P), dtype=object)
        part[:] = None
        for p in self.prims:
            if p.op != "add" or p.part is None:
                continue
            d = p.fn(P)
            m = d < best
            best = np.where(m, d, best)
            part[m] = p.part
        return part, best


# ---------------------------------------------------------------- 三线性采样
def trilinear(D, o, h, P):
    g = (A(P) - o) / h
    n = np.array(D.shape)
    i = np.clip(np.floor(g).astype(int), 0, n - 2)
    f = np.clip(g - i, 0, 1)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * D[i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz]
    return out


def grad_at(D, o, h, P):
    e = h * 0.5
    g = np.stack([trilinear(D, o, h, P + A(d) * e) - trilinear(D, o, h, P - A(d) * e) for d in ((1, 0, 0), (0, 1, 0), (0, 0, 1))], 1)
    return nrm(g)


# ---------------------------------------------------------------- Surface Nets
_CORNERS = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]])
_EDGES = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]


def surface_nets(D, o, h, project=2):
    """返回 (verts (M,3), quads (K,4))，法线朝外（D<0 为内部）"""
    s = D < 0
    nx, ny, nz = D.shape
    c = [s[x:nx - 1 + x, y:ny - 1 + y, z:nz - 1 + z] for x, y, z in _CORNERS]
    anyin = c[0].copy()
    allin = c[0].copy()
    for k in c[1:]:
        anyin |= k
        allin &= k
    act = anyin & ~allin
    del c, anyin, allin
    ci = np.argwhere(act)  # (M,3)
    M = len(ci)
    vid = np.full(act.shape, -1, np.int32)
    vid[ci[:, 0], ci[:, 1], ci[:, 2]] = np.arange(M, dtype=np.int32)
    vals = np.stack([D[ci[:, 0] + x, ci[:, 1] + y, ci[:, 2] + z] for x, y, z in _CORNERS], 1).astype(F)
    acc = np.zeros((M, 3))
    cnt = np.zeros(M)
    for a, b in _EDGES:
        va, vb = vals[:, a], vals[:, b]
        m = (va < 0) != (vb < 0)
        t = np.where(m, va / np.where(m, va - vb, 1), 0)
        p = _CORNERS[a] + (_CORNERS[b] - _CORNERS[a]) * t[:, None]
        acc += p * m[:, None]
        cnt += m
    V = o + (ci + acc / np.maximum(cnt, 1)[:, None]) * h
    quads = []
    # x 向边
    for axis in range(3):
        if axis == 0:
            e = s[:-1, :, :] != s[1:, :, :]
            e[:, 0, :] = False
            e[:, :, 0] = False
            e[:, -1, :] = False
            e[:, :, -1] = False
            idx = np.argwhere(e)
            i, j, k = idx.T
            q = np.stack([vid[i, j - 1, k - 1], vid[i, j, k - 1], vid[i, j, k], vid[i, j - 1, k]], 1)
            inside_low = s[i, j, k]
        elif axis == 1:
            e = s[:, :-1, :] != s[:, 1:, :]
            e[0, :, :] = False
            e[:, :, 0] = False
            e[-1, :, :] = False
            e[:, :, -1] = False
            idx = np.argwhere(e)
            i, j, k = idx.T
            q = np.stack([vid[i - 1, j, k - 1], vid[i - 1, j, k], vid[i, j, k], vid[i, j, k - 1]], 1)
            inside_low = s[i, j, k]
        else:
            e = s[:, :, :-1] != s[:, :, 1:]
            e[0, :, :] = False
            e[:, 0, :] = False
            e[-1, :, :] = False
            e[:, -1, :] = False
            idx = np.argwhere(e)
            i, j, k = idx.T
            q = np.stack([vid[i - 1, j - 1, k], vid[i, j - 1, k], vid[i, j, k], vid[i - 1, j, k]], 1)
            inside_low = s[i, j, k]
        q = np.where(inside_low[:, None], q, q[:, ::-1])
        quads.append(q)
    Q = np.concatenate(quads, 0)
    Q = Q[np.all(Q >= 0, 1)]
    for _ in range(project):
        d = trilinear(D, o, h, V)
        g = np.stack([trilinear(D, o, h, V + A(dd) * h * 0.5) - trilinear(D, o, h, V - A(dd) * h * 0.5) for dd in ((1, 0, 0), (0, 1, 0), (0, 0, 1))], 1) / h
        gl2 = np.maximum(np.einsum("ij,ij->i", g, g), 1e-6)
        step = (d / gl2)[:, None] * g
        step = np.clip(step, -0.6 * h, 0.6 * h)
        V = V - step
    return V, Q


def polyline_dt(P, pts):
    """到折线的距离与归一化弧长参数 t（0 = 起点，1 = 终点）"""
    pts = A(pts)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    L = max(cum[-1], 1e-9)
    best = np.full(len(P), 1e9)
    bt = np.zeros(len(P))
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        l2 = max(float(ab @ ab), 1e-12)
        t = np.clip(((P - a) @ ab) / l2, 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        m = d < best
        best = np.where(m, d, best)
        bt = np.where(m, (cum[i] + t * seg[i]) / L, bt)
    return best, bt


class Strands:
    """记录毛束 / 发束的中心线，供上色时查询"最近一束的 t（根 → 梢）和编号"""

    def __init__(self):
        self.items = []  # (pts, rmax, id)

    def add(self, pts, rmax):
        self.items.append((A(pts), rmax, len(self.items)))

    def query(self, P, reach=1.6):
        best = np.full(len(P), 1e9)
        t = np.full(len(P), -1.0)
        sid = np.full(len(P), -1)
        for pts, r, k in self.items:
            lo, hi = pts.min(0) - r * reach, pts.max(0) + r * reach
            sel = np.nonzero(np.all((P >= lo) & (P <= hi), 1))[0]
            if not len(sel):
                continue
            d, tt = polyline_dt(P[sel], pts)
            d = d / r  # 相对半径
            m = d < best[sel]
            best[sel[m]] = d[m]
            t[sel[m]] = tt[m]
            sid[sel[m]] = k
        t[best > reach] = -1
        sid[best > reach] = -1
        return t, sid, best
