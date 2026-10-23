"""Frame-difference metrics for loop clips: python3 tools/loop_metrics.py loops/*.mp4
Per clip: mean |frame[i+1]-frame[i]| (0-255, on a 160 px wide greyscale decode), the worst spike vs the median (seam/pop indicator),
the wrap step (last -> first frame) vs the median, and reversal score: for a ping-pong clip the frame sequence mirrors itself, so the
best correlation between frames i and N-1-i-k is high; for a forward loop it is low. 'reversal' = fraction of frames whose best match
(excluding +-3 neighbours) is the mirror-index frame."""
import sys, subprocess, numpy as np
def frames(path, w=160):
    info = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.splitlines()[0].split(',')
    W, H = int(info[0]), int(info[1]); h = round(w * H / W / 2) * 2
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:v:0', '-vf', f'scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)
def metrics(path):
    F = frames(path); n = len(F); d = np.abs(np.diff(F, axis=0)).mean((1, 2)); med = float(np.median(d))
    wrap = float(np.abs(F[0] - F[-1]).mean())
    # zero-motion steps (duplicate frames at a turnaround) and reversal: frame i matched against all frames
    flat = F.reshape(n, -1); flat = flat - flat.mean(1, keepdims=True); flat /= np.linalg.norm(flat, axis=1, keepdims=True) + 1e-6
    C = flat @ flat.T; mirror = 0
    for i in range(n):
        c = C[i].copy(); c[max(0, i - 3):i + 4] = -9; j = int(np.argmax(c))
        if c[j] > 0.995: mirror += 1
    return dict(frames=n, median_step=round(med, 3), max_step=round(float(d.max()), 3), max_at=int(d.argmax()), spike_ratio=round(float(d.max()) / max(med, 1e-3), 2),
                wrap_step=round(wrap, 3), wrap_ratio=round(wrap / max(med, 1e-3), 2), dup_steps=int((d < 0.1 * med).sum()), revisits=round(mirror / n, 3))
if __name__ == '__main__':
    for p in sys.argv[1:]: print(p, metrics(p))
