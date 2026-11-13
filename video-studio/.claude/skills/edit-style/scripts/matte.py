"""Person cut-out for the pop-out head effect.
Reads the (constant frame rate) working copy of the footage, runs the U2-Net human segmentation model locally (ONNX Runtime, CPU),
smooths the matte over time and writes a transparent VP9 WebM next to it. Nothing is uploaded anywhere.

usage: python matte.py <input.mp4> <output.webm> <model.onnx> [--fps N]
"""
import subprocess
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image

src, dst, model = sys.argv[1], sys.argv[2], sys.argv[3]


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip().split(',')
    w, h = int(out[0]), int(out[1])
    n, d = out[2].split('/')
    return w, h, float(n) / float(d)


W, H, fps = probe(src)
sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
inp = sess.get_inputs()[0].name
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

reader = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
matte_path = dst + '.matte.mkv'
writer = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-', '-c:v', 'ffv1', matte_path], stdin=subprocess.PIPE)

prev = None
n = 0
fsize = W * H * 3
while True:
    buf = reader.stdout.read(fsize)
    if len(buf) < fsize:
        break
    frame = np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3)
    small = np.asarray(Image.fromarray(frame).resize((320, 320), Image.BILINEAR), dtype=np.float32) / 255.0
    x = ((small - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
    y = sess.run(None, {inp: x})[0][0, 0]
    y = (y - y.min()) / (y.max() - y.min() + 1e-6)
    # soft threshold: keeps hair edges soft, kills faint background
    y = np.clip((y - 0.35) / 0.4, 0, 1)
    y = y * y * (3 - 2 * y)
    a = np.asarray(Image.fromarray((y * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), dtype=np.float32) / 255.0
    if prev is not None:
        a = 0.55 * a + 0.45 * prev  # temporal smoothing against flicker
    prev = a
    writer.stdin.write((a * 255).astype(np.uint8).tobytes())
    n += 1
    if n % 100 == 0:
        print(f'matte {n} frames', flush=True)
writer.stdin.close()
writer.wait()
reader.wait()
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-i', matte_path, '-filter_complex', '[1:v]format=gray[a];[0:v][a]alphamerge', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '3M', '-auto-alt-ref', '0', '-g', '1', dst], check=True)
print(f'done {n} frames -> {dst}')
