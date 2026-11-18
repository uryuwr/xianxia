# -*- coding: utf-8 -*-
"""宣传片混音：旁白在上、音乐在下（按旁白包络自动压低音乐），叠加少量合成音效。
用法：
  python tools/trailer/mix.py trim <in.wav> <out.wav>        去掉 TTS 首尾静音，打印时长（秒）
  python tools/trailer/mix.py mix <spec.json> <out.wav>      按 spec 混音
spec：{"dur": 秒, "music": {"file": ..., "gain": 0.8}, "vo": [{"file", "t", "gain"}], "sfx": [{"file", "t", "gain"}], "duck": 0.62}
"""
import sys, json, wave
import numpy as np

SR = 48000

def read(path):
    with wave.open(path, "rb") as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    x = x.reshape(-1, ch)
    if ch == 1:
        x = np.repeat(x, 2, axis=1)
    if sr != SR:  # 线性重采样（TTS 已经是 48k，这里只是保险）
        t0 = np.arange(len(x)) / sr
        t1 = np.arange(int(len(x) * SR / sr)) / SR
        x = np.stack([np.interp(t1, t0, x[:, c]) for c in range(2)], axis=1)
    return x

def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())

def trim(inp, out):
    x = read(inp)
    a = np.abs(x).max(axis=1)
    win = int(0.01 * SR)
    env = np.convolve(a, np.ones(win) / win, mode="same")
    idx = np.where(env > 0.012)[0]
    if len(idx):
        s = max(0, idx[0] - int(0.03 * SR))
        e = min(len(x), idx[-1] + int(0.12 * SR))
        x = x[s:e]
    # 轻微温暖化：混一点一阶低通，压齿音
    try:
        from scipy.signal import lfilter
        lp = lfilter([1 - 0.35], [1, -0.35], x, axis=0)
        x = 0.7 * x + 0.3 * lp
    except Exception:
        pass
    peak = np.abs(x).max() or 1
    x = x / peak * 0.9
    write(out, x)
    print(f"{len(x) / SR:.3f}")

def place(bus, x, t, gain):
    i = int(round(t * SR))
    if i < 0:
        x = x[-i:]
        i = 0
    n = min(len(x), len(bus) - i)
    if n > 0:
        bus[i:i + n] += x[:n] * gain

def mix(spec_path, out):
    S = json.load(open(spec_path, encoding="utf-8"))
    N = int(S["dur"] * SR)
    vo = np.zeros((N, 2))
    sfx = np.zeros((N, 2))
    mus = np.zeros((N, 2))
    if S.get("music"):
        m = read(S["music"]["file"])
        place(mus, m, 0, S["music"].get("gain", 0.8))
    for v in S.get("vo", []):
        place(vo, read(v["file"]), v["t"], v.get("gain", 1.0))
    for f in S.get("sfx", []):
        place(sfx, read(f["file"]), f["t"], f.get("gain", 0.5))
    # 旁白包络 → 音乐压低（起 60ms，落 450ms）
    a = np.abs(vo).max(axis=1)
    hop = int(0.01 * SR)
    blocks = a[: (N // hop) * hop].reshape(-1, hop).max(axis=1)
    on = (blocks > 0.02).astype(float)
    env = np.zeros_like(on)
    att, rel = 1 - np.exp(-1 / 6), 1 - np.exp(-1 / 45)
    e = 0.0
    for i, v in enumerate(on):
        e += (v - e) * (att if v > e else rel)
        env[i] = e
    env = np.repeat(env, hop)
    env = np.pad(env, (0, N - len(env)), mode="edge")
    duck = S.get("duck", 0.6)
    g = 1 - duck * env
    out_x = mus * g[:, None] + vo + sfx
    # 母线：轻压缩 + 峰值限制（最终响度在 ffmpeg 里 loudnorm）
    peak = np.abs(out_x).max() or 1
    out_x = out_x / peak * 0.95
    out_x = np.tanh(out_x * 1.15) / np.tanh(1.15)
    fade = int(0.6 * SR)
    out_x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    write(out, out_x * 0.95)
    print("mix ok", out, f"{N / SR:.2f}s")

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "trim":
        trim(sys.argv[2], sys.argv[3])
    elif cmd == "mix":
        mix(sys.argv[2], sys.argv[3])
