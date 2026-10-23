"""Render two loopable PLACEHOLDER tracks for Europa's Hidden Ocean (procedural, royalty-free).
  1. 'Under the Ice' : mellow ambient pad, no beat, dark (low spectral centroid)  -> mood leans deep blue
  2. 'Vent Pulse'    : gentle steady 84 BPM kick + bass pulse + soft shimmer   -> beat/bass hooks, mood leans cyan
Loop-safe: every voice is periodic in the loop length and reverb is circular."""
import numpy as np, wave, subprocess, os
from scipy.signal import lfilter, fftconvolve
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'music')
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def lp(x, fc): a = np.exp(-2*np.pi*fc/SR); return lfilter([1-a], [1, -a], x)
def hp(x, fc): return x - lp(x, fc)
def creverb(x, secs=3.0, decay=.9, seed=1):
    n = int(secs*SR); t = np.arange(n)/SR; rng = np.random.default_rng(seed)
    ir = rng.standard_normal(n)*np.exp(-t/decay); ir /= np.sqrt((ir**2).sum())*3
    y = fftconvolve(x, ir); N = len(x); out = y[:N].copy(); out[:len(y)-N] += y[N:]; return out
def note(f, start, dur, total, a=1.5, r=2.0, harm=(1,.25,.08), det=.1):
    t = np.arange(int(dur*SR))/SR; s = 0
    for d, amp in [(-det,.5),(0,.7),(det,.5)]:
        ff = f*2**(d/48); s = s + amp*sum(h*np.sin(2*np.pi*ff*(k+1)*t) for k,h in enumerate(harm))
    e = np.minimum(1, t/a)**2 * np.minimum(1, (dur-t)/r).clip(0)**2
    buf = np.zeros(total); i0 = int(start*SR) % total; seg = s*e
    idx = (np.arange(len(seg)) + i0) % total; np.add.at(buf, idx, seg); return buf
def write(name, L, R):
    m = max(np.abs(L).max(), np.abs(R).max()); L, R = L/m*.7, R/m*.7
    st = (np.stack([L, R], 1)*32767).astype(np.int16); wav = f'/tmp/{name}.wav'
    with wave.open(wav, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,'-codec:a','libmp3lame','-b:a','128k', os.path.join(OUT, name+'.mp3')], check=True)

# 1. mellow pad, 72 s, chords every 12 s (Dm9 -> Bbmaj7 -> Fmaj7/A -> Gm9 ... all low & soft)
D = 72.0; N = int(D*SR); L = np.zeros(N); R = np.zeros(N)
chords = [[50,57,60,64,69],[46,53,57,62,65],[45,53,57,60,64],[43,50,55,58,62],[46,53,57,62,69],[45,52,57,60,64]]
for i, ch in enumerate(chords):
    for j, n in enumerate(ch):
        v = note(midi(n), i*12, 15, N, a=4, r=5, harm=(1,.12,.03))*(.5 if n > 60 else .8)
        L += v*(1-.15*(j%2)); R += v*(.85+.15*(j%2))
L, R = lp(L, 900), lp(R, 900)
L, R = L + creverb(L, seed=1)*.8, R + creverb(R, seed=2)*.8
write('under-the-ice', L, R)

# 2. steady pulse, 84 BPM, 64 beats = 45.7 s x2 -> ~91 s
BPM = 84; beat = 60/BPM; D = beat*128; N = int(round(D*SR)); L = np.zeros(N); R = np.zeros(N)
t = np.arange(int(.45*SR))/SR
kick = np.sin(2*np.pi*(48*t + 60*(1-np.exp(-t*30))/30))*np.exp(-t*7)
bassline = [38, 38, 41, 36]   # D, D, F, C per bar
for b in range(128):
    i0 = int(b*beat*SR); seg = kick[:min(len(kick), N-i0)]; L[i0:i0+len(seg)] += seg*1.0; R[i0:i0+len(seg)] += seg*1.0
    bn = bassline[(b//4) % 4]; tb = np.arange(int(beat*.9*SR))/SR
    bs = (np.sin(2*np.pi*midi(bn)*tb) + .3*np.sin(2*np.pi*midi(bn)*2*tb))*np.exp(-tb*3)*.55
    j0 = int((b*beat+.0)*SR); n2 = min(len(bs), N-j0); L[j0:j0+n2] += bs[:n2]; R[j0:j0+n2] += bs[:n2]
    # soft off-beat shimmer (bright, gives higher spectral centroid)
    ts = np.arange(int(.25*SR))/SR; rng = np.random.default_rng(b)
    sh = hp(rng.standard_normal(len(ts)), 5000)*np.exp(-ts*18)*.10
    k0 = int((b*beat+beat/2)*SR) % N; idx = (np.arange(len(sh))+k0) % N; np.add.at(L, idx, sh); np.add.at(R, idx, sh*.8)
pl = np.zeros(N)
arp = [74, 77, 81, 79, 74, 72, 77, 76]
for k in range(64):
    pl += note(midi(arp[k % 8]), k*beat*2, beat*2.5, N, a=.02, r=1.2, harm=(1,.4,.2,.1), det=.05)*.22
padv = sum(note(midi(n), 0, D, N, a=8, r=8, harm=(1,.3,.1))*.15 for n in [62, 65, 69, 74])
L += pl + padv; R += pl*.8 + padv
L, R = L + creverb(pl+padv, seed=3)*.5, R + creverb(pl+padv, seed=4)*.5
write('vent-pulse', L, R)
print('ok')
