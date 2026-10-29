"""Find seamless loop points in music that repeats (intro + A + A + tail).

Offline helper for docs/AUDIO.md "Adding music" — not part of the game bundle. Needs numpy.

  afconvert -f WAVE -d LEI16@44100 -c 2 track.mp3 /tmp/track.wav     # or: ffmpeg -i track.mp3 -ar 44100 -ac 2 /tmp/track.wav
  python3 -I loopfind.py /tmp/track.wav [minLoopSec]

Prints JSON: lag (samples), loopStart/loopEnd (samples + seconds) and quality metrics.
`ncc` > 0.98 means the repeat is (near) sample-identical; use loopStart/loopEnd ÷ 44100 in the manifest
with full precision (6 decimals) — rounding to milliseconds can leave an audible phase jump.
"""
import sys, json, wave
import numpy as np

SR = 44100


def load(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == SR, w.getframerate()
        n = w.getnframes()
        ch = w.getnchannels()
        raw = w.readframes(n)
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    x = x.reshape(-1, ch)
    return x


def features(mono, hop=2048, nfft=4096, bands=48):
    n = (len(mono) - nfft) // hop
    win = np.hanning(nfft).astype(np.float32)
    idx = np.arange(nfft)[None, :] + hop * np.arange(n)[:, None]
    frames = mono[idx] * win
    spec = np.abs(np.fft.rfft(frames, axis=1))
    # log-spaced bands 60 Hz .. 12 kHz
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    edges = np.geomspace(60, 12000, bands + 1)
    F = np.zeros((n, bands), np.float32)
    for b in range(bands):
        m = (freqs >= edges[b]) & (freqs < edges[b + 1])
        if m.any():
            F[:, b] = spec[:, m].mean(axis=1)
    F = np.log1p(F * 100)
    F -= F.mean(axis=1, keepdims=True)
    F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-9
    return F, hop


def main():
    path = sys.argv[1]
    min_loop = float(sys.argv[2]) if len(sys.argv) > 2 else 15.0
    x = load(path)
    mono = x.mean(axis=1)
    N = len(mono)
    F, hop = features(mono)
    n = len(F)
    fr = SR / hop
    W = int(8 * fr)  # 8-second window for sustained similarity
    best = (-1, 0, 0)
    lo = int(min_loop * fr)
    hi = n - W - 1
    scores = []
    for L in range(lo, hi):
        s = np.einsum("ij,ij->i", F[: n - L], F[L:])
        WL = max(W, int(0.6 * L))
        if WL >= len(s):
            continue
        c = np.convolve(s, np.ones(WL) / WL, mode="valid")
        k = int(np.argmax(c))
        scores.append((float(c[k]), L, k))
        if c[k] > best[0]:
            best = (float(c[k]), L, k)
    score, L, k = best
    top = sorted(scores, reverse=True)
    distinct = []
    for t in top:
        if all(abs(t[1] - d[1]) > fr * 2 for d in distinct):
            distinct.append(t)
        if len(distinct) >= 4:
            break
    # Prefer the shortest lag whose score is nearly as good (avoid picking 2x period)
    for sc, LL, kk in sorted(scores, key=lambda t: t[1]):
        if sc >= score - 0.004 and LL < L * 0.75:
            score, L, k = sc, LL, kk
            break
    coarse_lag = L * hop
    # per-frame similarity at this lag to find start of repeat region
    s = np.einsum("ij,ij->i", F[: n - L], F[L:])
    sm = np.convolve(s, np.ones(int(2 * fr)) / int(2 * fr), mode="same")
    thresh = min(0.97, score - 0.02)
    good = sm >= thresh
    # earliest frame where good holds for following 4 seconds
    run = int(4 * fr)
    start_frame = None
    for i in range(len(good) - run):
        if good[i : i + run].all():
            start_frame = i
            break
    if start_frame is None:
        start_frame = k
    # sample-level refinement of lag around a region well inside the repeat
    ref = start_frame * hop + int(3 * SR)
    seg = mono[ref : ref + int(4 * SR)]
    D = int(0.08 * SR)
    tgt = mono[ref + coarse_lag - D : ref + coarse_lag + D + len(seg)]
    # FFT cross-correlation
    nfft = 1 << int(np.ceil(np.log2(len(tgt) + len(seg))))
    cc = np.fft.irfft(np.fft.rfft(tgt, nfft) * np.conj(np.fft.rfft(seg, nfft)), nfft)[: 2 * D + 1]
    off = int(np.argmax(cc)) - D
    lag = coarse_lag + off
    a = mono[ref : ref + len(seg)]
    b = mono[ref + lag : ref + lag + len(seg)]
    ncc = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))
    snr = float(10 * np.log10(np.sum(a ** 2) / (np.sum((a - b) ** 2) + 1e-12)))

    # choose loopStart: first point >= start of repeat (+1.0 s margin) where local sample match is excellent
    def local_snr(p, half=4096):
        a = x[p - half : p + half]
        b = x[p + lag - half : p + lag + half]
        if len(b) < 2 * half or len(a) < 2 * half:
            return -99
        return float(10 * np.log10(np.sum(a ** 2) / (np.sum((a - b) ** 2) + 1e-12)))

    cand0 = start_frame * hop + int(1.0 * SR)
    best_p, best_snr = cand0, -99
    p = cand0
    # scan up to 12 s for a high-quality seam point; accept first >= 30 dB, else best found
    while p < cand0 + 12 * SR and p + lag + SR < N:
        v = local_snr(p)
        if v > best_snr:
            best_p, best_snr = p, v
        if v >= 30:
            break
        p += 2205
    loop_start = best_p
    loop_end = loop_start + lag
    out = {
        "file": path,
        "duration": N / SR,
        "coarse_score": round(score, 4),
        "lag_samples": int(lag),
        "lag_sec": round(lag / SR, 4),
        "repeat_starts_sec": round(start_frame * hop / SR, 2),
        "ncc": round(ncc, 5),
        "snr_db": round(snr, 2),
        "loopStart": int(loop_start),
        "loopEnd": int(loop_end),
        "loopStart_sec": round(loop_start / SR, 4),
        "loopEnd_sec": round(loop_end / SR, 4),
        "seam_snr_db": round(best_snr, 2),
        "alt_candidates": [(round(a, 4), round(b * hop / SR, 2)) for a, b, _ in distinct],
        "tail_after_loopEnd_sec": round((N - loop_end) / SR, 2),
    }
    print(json.dumps(out))


if __name__ == "__main__":
    main()
