# -*- coding: utf-8 -*-
"""《墨途》宣传片配乐与音效合成（纯代码合成，无采样、无版权素材）。
用法：python tools/trailer/music.py <cues.json> <out_music.wav> [<sfx_dir>]
cues.json：{"dur": 秒, "sec": {"world": t, "cave": t, "battle": t, "boss": t, "kill": t, "outro": t}, "title": t, "hits": [[t, "boom"|"swish"|"break"|"stamp"|"slash"], ...]}
- 调式：B 羽调式五声（B D E F# A），古琴 / 古筝拨弦用加性合成（泛音逐个衰减 + 拨弦噪声 + 吟猱滑音），
  洞箫 = 正弦 + 气声，长音 pad，战斗段太鼓 / 板鼓，结尾一声磬（非谐泛音）。
- 另输出音效（挥剑、破盾、盖印、重击）到 sfx_dir，供合成时按时间点叠加。
"""
import json, sys, os, math
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

SR = 48000
rng = np.random.default_rng(7)

def t_arr(d):
    return np.arange(int(d * SR)) / SR

def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)

def lp(x, fc, order=2):
    sos = butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos")
    return sosfilt(sos, x)

def hp(x, fc, order=2):
    sos = butter(order, fc, "high", fs=SR, output="sos")
    return sosfilt(sos, x)

def bp(x, lo, hi, order=2):
    sos = butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos")
    return sosfilt(sos, x)

# ---------------- 乐器 ----------------
def pluck(f, dur=2.5, bright=1.0, decay=1.0, pos=0.18, slide=0.0, slide_t=0.25, vib=0.0, body=1.0):
    """古琴 / 古筝：加性拨弦。slide = 吟猱 / 滑音（半音数，正 = 上滑），vib = 揉弦深度（半音）"""
    t = t_arr(dur)
    semis = np.zeros_like(t)
    if slide:
        k = np.clip(t / slide_t, 0, 1)
        semis = slide * (1 - (1 - k) ** 2)
    if vib:
        semis = semis + vib * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.15) * 3, 0, 1)
    fr = f * 2 ** (semis / 12)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    out = np.zeros_like(t)
    K = int(min(28, 9000 / f))
    for k in range(1, K + 1):
        a = abs(math.sin(math.pi * k * pos)) / k ** (1.15 / bright)
        inh = 1 + 0.0004 * k * k
        rate = (0.9 + 0.55 * k ** 1.25) / decay
        out += a * np.sin(ph * k * inh) * np.exp(-rate * t)
    n = int(0.012 * SR)
    burst = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.003 * SR))
    out[:n] += 0.35 * bright * lp(burst, 5000 * bright)
    if body:  # 琴身共鸣：低频一点点
        out += 0.25 * body * np.sin(2 * np.pi * 110 * t) * np.exp(-9 * t) * (f < 300)
    env = np.minimum(1, t / 0.002)
    return out * env * 0.22

def xiao(f, dur, amp=1.0):
    """洞箫：慢起音、揉音、气声"""
    t = t_arr(dur)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.0 * t) * np.clip(t - 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    tone = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    breath = bp(rng.standard_normal(len(t)), f * 0.8, f * 3.5) * 0.35
    env = np.minimum(1, t / 0.18) * np.minimum(1, (dur - t) / 0.35)
    env = np.clip(env, 0, 1) ** 1.3
    return (tone * 0.8 + breath) * env * 0.16 * amp

def pad(freqs, dur, amp=1.0, att=1.5, rel=2.0, bright=1800):
    t = t_arr(dur)
    out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            ph = 2 * np.pi * ff * t + rng.uniform(0, 6.28)
            out += np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    out = lp(out, bright)
    env = np.clip(np.minimum(t / att, (dur - t) / rel), 0, 1)
    return out * env * 0.035 * amp / max(1, len(freqs) / 3)

def taiko(amp=1.0, f0=150, f1=52, dur=1.2):
    t = t_arr(dur)
    fr = f1 + (f0 - f1) * np.exp(-t * 18)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    body = np.sin(ph) * np.exp(-t * 4.2)
    skin = lp(rng.standard_normal(len(t)), 1800) * np.exp(-t * 28) * 0.5
    return (body + skin) * 0.55 * amp

def bangu(amp=1.0):
    """板鼓 / 小鼓：短促清脆"""
    t = t_arr(0.25)
    ph = 2 * np.pi * np.cumsum(420 + 260 * np.exp(-t * 60)) / SR
    x = np.sin(ph) * np.exp(-t * 30) + bp(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t * 45) * 0.6
    return x * 0.25 * amp

def qing(f=392.0, dur=7.0, amp=1.0):
    """磬：石质非谐泛音，长余韵"""
    t = t_arr(dur)
    out = np.zeros_like(t)
    for r, a, d in ((1, 1.0, 0.55), (2.76, 0.55, 0.9), (5.40, 0.3, 1.6), (8.93, 0.16, 2.6), (1.007, 0.5, 0.6)):
        out += a * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6)) * np.exp(-d * t)
    n = int(0.01 * SR)
    out[:n] += rng.standard_normal(n) * 0.4 * np.exp(-np.arange(n) / 80)
    return out * 0.3 * amp

def gong_swell(dur=2.5, amp=1.0):
    t = t_arr(dur)
    x = np.zeros_like(t)
    for f in (88, 131, 177, 233, 309, 412):
        x += np.sin(2 * np.pi * f * t * (1 + 0.002 * np.sin(2 * np.pi * 3 * t)))
    x += lp(rng.standard_normal(len(t)), 3000) * 0.6
    env = (t / dur) ** 2.2
    return x * env * 0.07 * amp

# ---------------- 音效 ----------------
def sfx_swish():
    t = t_arr(0.32)
    n = rng.standard_normal(len(t))
    fc = 900 + 4200 * np.sin(np.pi * np.clip(t / 0.22, 0, 1))
    y = np.zeros_like(n)
    # 分段带通近似扫频
    seg = int(0.01 * SR)
    for i in range(0, len(n), seg):
        c = fc[i]
        y[i:i + seg] = bp(n[max(0, i - 400):i + seg], c * 0.6, c * 1.4)[-len(n[i:i + seg]):]
    env = np.sin(np.pi * np.clip(t / 0.3, 0, 1)) ** 2
    return y * env * 0.5

def sfx_slash():
    a = sfx_swish()
    t = t_arr(0.5)
    hit = np.sin(2 * np.pi * np.cumsum(90 + 200 * np.exp(-t * 40)) / SR) * np.exp(-t * 12) * 0.6
    out = np.zeros(len(t))
    out[:len(a)] += a
    out += hit
    return out

def sfx_break():
    t = t_arr(1.4)
    out = np.zeros_like(t)
    for f in (1210, 1730, 2390, 3110, 4020, 5230):
        out += np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t * (5 + f / 900)) * 0.18
    out += hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 9) * 0.5
    out += taiko(1.0, 120, 45, 1.4) * 0.9
    return out * 0.8

def sfx_stamp():
    t = t_arr(0.5)
    thud = np.sin(2 * np.pi * np.cumsum(70 + 120 * np.exp(-t * 50)) / SR) * np.exp(-t * 14)
    paper = bp(rng.standard_normal(len(t)), 600, 4000) * np.exp(-t * 35) * 0.5
    return (thud + paper) * 0.7

def sfx_boom():
    t = t_arr(3.0)
    x = taiko(1.4, 110, 38, 3.0) + lp(rng.standard_normal(len(t)), 600) * np.exp(-t * 2.2) * 0.5
    return x

SFX = {"swish": sfx_swish, "slash": sfx_slash, "break": sfx_break, "stamp": sfx_stamp, "boom": sfx_boom}

# ---------------- 编曲 ----------------
B3, D4, E4, Fs4, A4 = 59, 62, 64, 66, 69
SCALE = [47, 50, 52, 54, 57, 59, 62, 64, 66, 69, 71, 74, 76, 78, 81]  # B 羽五声（低到高）
CHORDS = [  # 根音、和弦音（五声内）
    (35, [47, 54, 59, 62]),  # Bm
    (38, [50, 57, 62, 66]),  # D
    (33, [45, 52, 57, 64]),  # A
    (40, [52, 59, 64, 67 - 1]),  # Em(add)
]

class Mix:
    def __init__(self, dur):
        self.L = np.zeros(int(dur * SR) + SR * 8)
        self.R = np.zeros_like(self.L)
        self.wet = np.zeros_like(self.L)  # 混响送量（单声道）

    def add(self, x, t, pan=0.0, rev=0.25, gain=1.0):
        i = int(t * SR)
        if i < 0:
            x = x[-i:]
            i = 0
        n = min(len(x), len(self.L) - i)
        if n <= 0:
            return
        x = x[:n] * gain
        self.L[i:i + n] += x * math.cos((pan + 1) * math.pi / 4)
        self.R[i:i + n] += x * math.sin((pan + 1) * math.pi / 4)
        self.wet[i:i + n] += x * rev

    def render(self, dur):
        irl = t_arr(3.2)
        ir = rng.standard_normal((2, len(irl))) * np.exp(-irl * 2.1)
        ir = np.stack([lp(ir[0], 5000), lp(ir[1], 4600)])
        ir[:, : int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
        ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
        wl = fftconvolve(self.wet, ir[0])[: len(self.L)] * 0.5
        wr = fftconvolve(self.wet, ir[1])[: len(self.L)] * 0.5
        L, R = self.L + wl, self.R + wr
        n = int(dur * SR)
        st = np.stack([L[:n], R[:n]], axis=1)
        st = np.tanh(st * 1.2) / 1.2  # 软削波
        fade = int(0.05 * SR)
        st[:fade] *= np.linspace(0, 1, fade)[:, None]
        return st

def compose(c):
    dur = c["dur"]
    S = c["sec"]
    m = Mix(dur)
    bpm = 88.0
    beat = 60 / bpm
    world, cave, battle, boss, kill, outro = S["world"], S["cave"], S["battle"], S["boss"], S["kill"], S["outro"]
    title = c.get("title", 1.2)

    # ---- 开场：低音长音 + 标题处一声泛音 + 起墨 ----
    m.add(pad([midi(35), midi(47), midi(54)], world + 1.5, amp=1.2, att=1.2, rel=1.2, bright=900), 0.0, rev=0.3)
    m.add(pluck(midi(71), 5, bright=0.6, decay=2.5, pos=0.5), title, pan=0.1, rev=0.6, gain=1.3)  # 泛音
    m.add(pluck(midi(59), 5, bright=0.7, decay=2.0, slide=0, vib=0.12), title + 0.05, pan=-0.1, rev=0.5, gain=0.9)
    m.add(pluck(midi(47), 5, bright=0.6, decay=2.2, slide=2, slide_t=0.5), title + 1.4, pan=-0.2, rev=0.5, gain=0.9)
    # 开场连招：板鼓点缀，蓄势斩处大鼓
    for t in np.arange(title + 2.4, world - 0.4, beat / 2):
        m.add(bangu(0.5), t, pan=0.3, rev=0.15)

    # ---- 世界与搜打撤：古筝分解和弦 + 洞箫旋律 + 轻鼓 ----
    t, i = world, 0
    mel = [(66, 1.5), (69, 0.5), (71, 2), (69, 1), (66, 1), (64, 2), (62, 1), (64, 1), (66, 4),
           (69, 1.5), (71, 0.5), (74, 2), (71, 1), (69, 1), (66, 3), (64, 1), (62, 4)]
    mt, mi = world + beat * 4, 0
    while t < cave - 0.2:
        root, ch = CHORDS[(i // 8) % 4]
        if i % 8 == 0:
            m.add(pluck(midi(root), 3.5, bright=0.6, decay=2.2), t, pan=-0.15, rev=0.3, gain=1.1)
            m.add(pad([midi(n) for n in ch[:3]], beat * 8 + 1.5, amp=0.8, att=1.0, rel=1.5), t, rev=0.35)
        note = ch[[0, 2, 1, 3, 2, 1, 3, 2][i % 8]] + 12
        m.add(pluck(midi(note), 1.8, bright=1.2, decay=0.9, pos=0.13), t, pan=0.35 * math.sin(i), rev=0.3, gain=0.75)
        if i % 4 == 0:
            m.add(taiko(0.25, 180, 70, 0.6), t, rev=0.15)
        if i % 4 == 2:
            m.add(bangu(0.35), t, pan=0.25, rev=0.1)
        t += beat / 2
        i += 1
    while mt < cave - 1.0 and mi < len(mel):
        n, l = mel[mi]
        d = l * beat
        m.add(xiao(midi(n), min(d + 0.15, cave - mt), 1.0), mt, pan=0.15, rev=0.55)
        mt += d
        mi += 1

    # ---- 洞府与成长：古琴慢句 + 吟猱，pad 铺底，无鼓 ----
    m.add(pad([midi(n) for n in (50, 57, 62, 66)], battle - cave + 1.5, amp=1.0, att=1.5, rel=1.5, bright=1500), cave - 0.3, rev=0.4)
    qin = [(62, 1, 0), (66, 1, 0), (69, 2, 2), (71, 1, 0), (69, 1, -2), (66, 2, 0), (64, 1, 0), (62, 1, 0), (59, 3, 2),
           (66, 1, 0), (69, 1, 0), (74, 2, 0), (71, 1, -2), (69, 1, 0), (66, 4, 0)]
    t, k = cave + 0.2, 0
    while t < battle - 0.6:
        n, l, sl = qin[k % len(qin)]
        m.add(pluck(midi(n), 3.0, bright=0.75, decay=1.6, pos=0.2, slide=sl * 0.5, slide_t=0.4, vib=0.08 if l >= 2 else 0), t, pan=-0.1, rev=0.5)
        if k % 2 == 0:
            m.add(pluck(midi(n - 12), 3.0, bright=0.6, decay=1.8), t, pan=0.15, rev=0.4, gain=0.5)
        t += l * beat * 0.75
        k += 1
    for j, t in enumerate(np.arange(cave + 0.6, battle - 0.5, beat * 2)):  # 风铃般的高音点
        if j % 3 == 1:
            m.add(pluck(midi(SCALE[10 + (j % 5)] + 12), 2.0, bright=1.5, decay=1.0, pos=0.5), t + beat * 0.5, pan=0.5, rev=0.7, gain=0.35)

    # ---- 战斗：太鼓节奏型 + 古筝十六分轮指 + 低音持续 ----
    beat2 = 60 / 104
    m.add(gong_swell(1.6, 0.8), battle - 1.6, rev=0.3)
    m.add(pad([midi(35), midi(42), midi(47)], boss - battle + 1, amp=1.3, att=0.3, rel=1, bright=1200), battle, rev=0.2)
    t, i = battle, 0
    pattern = [1, 0, 0, 0.5, 0, 0, 0.8, 0, 1, 0, 0.5, 0, 0.8, 0.4, 0.6, 0.4]
    while t < boss - 0.05:
        p = pattern[i % 16]
        if p:
            m.add(taiko(0.6 * p + 0.2, 150, 52), t, rev=0.15)
        if i % 4 == 2:
            m.add(bangu(0.5), t, pan=0.3, rev=0.1)
        root, ch = CHORDS[[0, 0, 2, 3][(i // 16) % 4]]
        note = ch[[0, 1, 2, 1, 3, 2, 1, 2][i % 8]] + 12
        m.add(pluck(midi(note), 0.7, bright=1.4, decay=0.4, pos=0.12), t, pan=-0.3 + 0.6 * ((i % 2)), rev=0.2, gain=0.55)
        if i % 8 == 0:
            m.add(pluck(midi(root), 1.5, bright=0.9, decay=1.0), t, rev=0.2, gain=1.0)
        t += beat2 / 4
        i += 1

    # ---- Boss：更重的鼓 + 洞箫长音 + 收在一击前的留白 ----
    beat3 = 60 / 112
    m.add(pad([midi(n) for n in (35, 47, 54, 59, 66)], kill - boss, amp=1.5, att=2.5, rel=0.3, bright=2200), boss, rev=0.35)
    m.add(xiao(midi(78), min(4.0, kill - boss - 0.5), 1.1), boss + 0.8, pan=0.1, rev=0.6)
    t, i = boss, 0
    pattern = [1, 0, 0.6, 0, 1, 0, 0.6, 0.4, 1, 0, 0.6, 0, 1, 0.5, 0.8, 0.9]
    while t < kill - 0.55:
        p = pattern[i % 16]
        if p:
            m.add(taiko(0.75 * p + 0.25, 140, 48), t, rev=0.18)
            m.add(taiko(0.4 * p, 260, 110, 0.4), t, pan=0.2, rev=0.1)
        note = SCALE[[5, 7, 9, 7, 8, 7, 6, 7][i % 8]] + 12
        m.add(pluck(midi(note), 0.6, bright=1.5, decay=0.35, pos=0.11), t, pan=0.3 * math.sin(i * 1.3), rev=0.2, gain=0.6)
        t += beat3 / 4
        i += 1
    # 最后一击：重鼓 + 锣
    m.add(taiko(1.6, 120, 36, 3.0), kill, rev=0.35)
    m.add(pad([midi(35), midi(47)], outro - kill + 0.8, amp=1.0, att=0.05, rel=1.2, bright=700), kill, rev=0.4)

    # ---- 收尾：一声磬 + 古琴泛音 ----
    m.add(qing(midi(71) / 2, 7.0, 1.2), outro, rev=0.7)
    m.add(pad([midi(47), midi(54), midi(59), midi(66)], dur - outro + 0.2, amp=0.9, att=1.0, rel=2.5, bright=1600), outro, rev=0.5)
    m.add(pluck(midi(83), 4.0, bright=0.5, decay=2.5, pos=0.5), outro + 1.6, pan=0.2, rev=0.7, gain=0.8)
    m.add(pluck(midi(78), 4.0, bright=0.5, decay=2.5, pos=0.5), outro + 2.3, pan=-0.2, rev=0.7, gain=0.6)

    st = m.render(dur)
    fade = int(1.5 * SR)
    st[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    return st

def write_wav(path, st):
    st = np.asarray(st)
    if st.ndim == 1:
        st = np.stack([st, st], axis=1)
    peak = np.max(np.abs(st)) or 1
    st = st / peak * 0.89
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())

if __name__ == "__main__":
    cues = json.load(open(sys.argv[1], encoding="utf-8"))
    write_wav(sys.argv[2], compose(cues))
    if len(sys.argv) > 3:
        os.makedirs(sys.argv[3], exist_ok=True)
        for k, f in SFX.items():
            write_wav(os.path.join(sys.argv[3], k + ".wav"), f())
    print("music ok", sys.argv[2])
