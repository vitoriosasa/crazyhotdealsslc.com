import os
from PIL import Image, ImageDraw, ImageFont

SRC = r'C:\Users\amazi\.workbuddy-ai\clipboard-images\clipboard-2026-10-22T11-29-45-129Z-030832e4.jpg'
OUT = r'C:\Users\amazi\WorkBuddy AI\2026-10-21-00-12-13\furniture-site\data\uploads\warehouse-gate.jpg'
OUT2 = r'C:\Users\amazi\WorkBuddy AI\2026-10-21-00-12-13\warehouse-gate.jpg'

im = Image.open(SRC).convert('RGB')
d = ImageDraw.Draw(im, 'RGBA')

# Bounding box around the full row of four white roll-up loading doors on the wall
box = (758, 243, 1252, 363)
red = (224, 40, 40, 255)
d.ellipse(box, fill=(224, 40, 40, 46))   # soft highlight
d.ellipse(box, outline=red, width=9)      # thick ring

label = "PICKUP GATE \u00b7 4 white doors"
font = None
for fp, sz in [("C:/Windows/Fonts/msyhbd.ttc", 30), ("C:/Windows/Fonts/msyh.ttc", 30),
               ("C:/Windows/Fonts/segoeuib.ttf", 28), ("C:/Windows/Fonts/arialbd.ttf", 28),
               ("C:/Windows/Fonts/arial.ttf", 28)]:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, sz); break
        except Exception:
            pass
if font is None:
    font = ImageFont.load_default()

tb = d.textbbox((0, 0), label, font=font)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
pad = 12
cx = (box[0] + box[2]) // 2
lx = cx - (tw + 2 * pad) // 2
if lx < 6:
    lx = 6
if lx + tw + 2 * pad > im.size[0]:
    lx = im.size[0] - tw - 2 * pad - 6
ly = box[3] + 16
d.rounded_rectangle([lx, ly, lx + tw + 2 * pad, ly + th + 2 * pad], radius=9, fill=(224, 40, 40, 238))
d.text((lx + pad, ly + pad - tb[1]), label, font=font, fill=(255, 255, 255, 255))

im.save(OUT, quality=92)
im.save(OUT2, quality=92)
print("saved; box =", box, "; label_px =", (tw, th))
