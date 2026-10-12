from pathlib import Path
from PIL import Image, ImageDraw

destination = Path(__file__).resolve().parents[1] / 'hi3d-ios' / 'hi3d-Assets.xcassets' / 'hi3d-AppIcon.appiconset'
size = 1024
image = Image.new('RGB', (size, size), '#789576')
draw = ImageDraw.Draw(image)
draw.ellipse((90, 70, 970, 950), fill='#8baa82')
draw.ellipse((140, 110, 920, 890), fill='#a1ba92')
draw.ellipse((180, 160, 840, 820), fill='#dae8cb')
draw.polygon([(310, 390), (390, 280), (630, 280), (715, 390), (510, 745)], fill='#9c83b3')
draw.polygon([(310, 390), (510, 745), (475, 390)], fill='#bda6d4')
draw.polygon([(475, 390), (510, 745), (715, 390)], fill='#8068a7')
draw.polygon([(310, 390), (390, 280), (475, 390)], fill='#d9c7ec')
draw.polygon([(390, 280), (630, 280), (475, 390)], fill='#c8b6df')
draw.polygon([(630, 280), (715, 390), (475, 390)], fill='#a98dc9')
draw.line([(310, 390), (715, 390)], fill='#f4e9fa', width=12)
draw.polygon([(742, 215), (758, 260), (804, 277), (758, 294), (742, 340), (726, 294), (680, 277), (726, 260)], fill='#fff8e6')
draw.polygon([(225, 640), (234, 668), (262, 677), (234, 686), (225, 714), (216, 686), (188, 677), (216, 668)], fill='#fff8e6')
for points, filename in [
    (1024, 'hi3d-icon-1024.png'),
    (180, 'hi3d-icon-180.png'),
    (120, 'hi3d-icon-120.png'),
    (87, 'hi3d-icon-87.png'),
    (80, 'hi3d-icon-80.png'),
    (60, 'hi3d-icon-60.png'),
    (58, 'hi3d-icon-58.png'),
    (40, 'hi3d-icon-40.png'),
]:
    image.resize((points, points), Image.Resampling.LANCZOS).save(destination / filename)
