"""Rebuild loop clips from the original renders (Oct 18 2026, test #5).
  python3 tools/make_loops.py pingpong-eased <src.mp4> <dst.mp4> [--start 6 --end 139 --ramp 14]
      Jellies: forward then backward, but with an EASED turnaround (speed ramps down to 0 and back up over --ramp frames at each end,
      intermediate positions = blend of the two nearest source frames) and an exactly matching wrap point (no duplicated or skipped frame).
  python3 tools/make_loops.py crossfade <src.mp4> <dst.mp4> [--start 2 --end 145 --xfade 20]
      Plumes/flows: TRUE forward loop. The last --xfade frames are dissolved into the first ones (smootherstep weight), so playback
      never reverses: out[k] = src[k] for k >= X, out[k] = mix(src[N+k], src[k], w(k)) for k < X, N = clip length - X.
Output: H.264 yuv420p, faststart, no audio, 24 fps, same size as the source unless --width."""
import sys, argparse, subprocess, numpy as np
def probe(p):
    w, h = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip().splitlines()[0].split(',')[:2]
    return int(w), int(h)
def read(p, width=None):
    W, H = probe(p)
    if width: H = round(width * H / W / 2) * 2; W = width
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-map', '0:v:0', '-vf', f'scale={W}:{H}:flags=lanczos', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3), W, H
def write(frames, dst, W, H, crf=24):
    pr = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '24', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'slow',
                           '-crf', str(crf), '-pix_fmt', 'yuv420p', '-g', '48', '-movflags', '+faststart', dst], stdin=subprocess.PIPE)
    for f in frames: pr.stdin.write(np.ascontiguousarray(f).tobytes())
    pr.stdin.close(); pr.wait(); print('wrote', dst, len(frames), 'frames')
def at(F, p):   # fractional frame: linear blend of neighbours
    i = int(np.floor(p)); k = p - i; j = min(i + 1, len(F) - 1)
    return F[i] if k < 1e-3 else (F[i].astype(np.float32) * (1 - k) + F[j].astype(np.float32) * k + .5).astype(np.uint8)
def pingpong_eased(F, ramp):
    n = len(F) - 1   # distance to travel (frames) each way at speed 1 with trapezoid ramps of `ramp` frames
    M = int(round(n + ramp)); v = n / (M - ramp)   # with ramps of length R the covered distance is v*(M-R)
    pos = []; p = 0.0
    def speed(k):   # k in [0, M): smooth ramps up at the start and down at the end (cosine)
        if k < ramp: return v * 0.5 * (1 - np.cos(np.pi * (k + 0.5) / ramp))
        if k >= M - ramp: return v * 0.5 * (1 - np.cos(np.pi * (M - k - 0.5) / ramp))
        return v
    sp = np.array([speed(k) for k in range(M)]); sp *= n / sp.sum()   # exact distance
    fwd = np.concatenate([[0], np.cumsum(sp)[:-1]])                   # positions 0 .. n - last step
    pos = list(fwd) + list(n - fwd)                                     # forward 0..(n-s), backward n..s: wrap lands exactly on 0
    return [at(F, min(max(q, 0), n)) for q in pos]
def crossfade(F, X):
    N = len(F) - X; out = []
    for k in range(N):
        if k >= X: out.append(F[k]); continue
        u = (k + 0.5) / X; w = u * u * u * (u * (u * 6 - 15) + 10)
        out.append((F[N + k].astype(np.float32) * (1 - w) + F[k].astype(np.float32) * w + .5).astype(np.uint8))
    return out
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('mode', choices=['pingpong-eased', 'crossfade']); ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--start', type=int, default=None); ap.add_argument('--end', type=int, default=None); ap.add_argument('--ramp', type=int, default=14)
    ap.add_argument('--xfade', type=int, default=20); ap.add_argument('--width', type=int, default=None); ap.add_argument('--crf', type=int, default=24)
    a = ap.parse_args(); F, W, H = read(a.src, a.width); F = F[a.start:a.end]
    out = pingpong_eased(F, a.ramp) if a.mode == 'pingpong-eased' else crossfade(F, a.xfade)
    write(out, a.dst, W, H, a.crf)
