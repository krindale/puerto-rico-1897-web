# 타일 이미지 WebP 무손실 변환 — `python tools/optimize-images.py`
#
# 원본 PNG는 그대로 두고 같은 이름의 .webp를 만든다 (픽셀 완전 동일, 용량 약 43% 감소).
# 게임은 imgTag가 .webp를 먼저 시도하고 없으면 .png로 폴백하므로, 새 타일을 PNG로
# 추가하면 바로 동작하고 이 스크립트를 다시 돌리면 최적화된다.
# 배포(.github/workflows/deploy.yml)에는 webp만 올라가 전송량이 줄어든다.
import glob, os, sys
from PIL import Image

root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..')
src_total = out_total = 0
made = skipped = 0
for f in sorted(glob.glob(os.path.join(root, 'img', '*.png'))):
    out = f[:-4] + '.webp'
    # 원본이 더 최근일 때만 다시 만든다 (재실행 비용 절약)
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(f):
        skipped += 1
        src_total += os.path.getsize(f); out_total += os.path.getsize(out)
        continue
    Image.open(f).save(out, format='WEBP', lossless=True, quality=100, method=6)
    made += 1
    src_total += os.path.getsize(f); out_total += os.path.getsize(out)
print('변환 %d장 · 유지 %d장' % (made, skipped))
print('PNG %dKB → WebP %dKB (%d%% 감소, 무손실)' %
      (src_total // 1024, out_total // 1024, 100 - out_total * 100 // max(1, src_total)))
