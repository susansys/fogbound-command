"""Original geometric display fixtures. No third-party or remote image inputs."""
from pathlib import Path
from PIL import Image, ImageDraw, __version__
import hashlib, json

root = Path(__file__).resolve().parents[1] / 'src' / 'map-assets'
root.mkdir(exist_ok=True)
assets = []
for name, palette in [('grid', ('#233e42', '#51736c', '#e5c88c')), ('colour', ('#323859', '#637199', '#daabca'))]:
    image = Image.new('RGB', (512, 384), palette[0])
    draw = ImageDraw.Draw(image)
    for x in range(0, 512, 32):
        draw.line((x, 0, x, 383), fill=palette[1])
    for y in range(0, 384, 32):
        draw.line((0, y, 511, y), fill=palette[1])
    draw.rectangle((128, 96, 384, 288), outline=palette[2], width=3)
    for x, y in [(128, 96), (384, 96), (128, 288), (384, 288), (256, 192)]:
        draw.line((x-6, y, x+6, y), fill=palette[2], width=2)
        draw.line((x, y-6, x, y+6), fill=palette[2], width=2)
    for box, colour in [((0,0,15,15),'#ee7969'), ((496,0,511,15),'#8accc4'), ((496,368,511,383),'#a7bafa'), ((0,368,15,383),'#f0cf78')]:
        draw.rectangle(box, fill=colour)
    draw.line((140,110,175,110), fill=palette[2], width=2)
    draw.polygon([(175,110),(167,105),(167,115)], fill=palette[2])
    draw.line((140,110,140,145), fill=palette[2], width=2)
    draw.polygon([(140,145),(135,137),(145,137)], fill=palette[2])
    path = root / (name+'.png')
    image.save(path, optimize=True)
    data = path.read_bytes()
    assets.append(dict(id=name, file=path.name, mime='image/png', dimensions=[512,384], bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
manifest = dict(sample_id='MAPA-SYNTH', version=1, synthetic=True,
    creator='玄枢行动 sole developer / 01a13080-ddaf-7041-840b-1a19cf2a6f53',
    provenance=dict(generated='2026-10-14', tool='Python/Pillow '+__version__, rules='Original colour grid, distinct corners, axes and five control crosses; no external images or fonts'),
    attribution_text='合成验证资料 · 非遥感影像',
    mapping=dict(id='MAPA-SYNTH-MERCATOR', version=1, units='fictional-map-metre', axis='E=x,N=-y', game_extent=[0,0,400,300], background_extent=[-200,-150,600,450], image_corners=[[-0.001796630568,0.001347472926],[0.005389891705,0.001347472926],[0.005389891705,-0.004042418775],[-0.001796630568,-0.004042418775]]), assets=assets)
path = root / 'manifest.json'
path.write_bytes((json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
total = sum(a['bytes'] for a in assets)+path.stat().st_size
assert total <= 2*1024*1024 and all(a['bytes'] <= 1024*1024 for a in assets)
print(json.dumps(dict(total_bytes=total, manifest_sha256=hashlib.sha256(path.read_bytes()).hexdigest(), assets=assets),ensure_ascii=False))
