"""Quick test: generate branded frame preview PNG to verify design."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from PIL import Image, ImageDraw, ImageFont

# ── Copy of _make_branded_image from app.py ─────────────────────────────────
def _make_branded_image(kind, w, h):
    img  = Image.new('RGB', (w, h), (10, 21, 51))
    draw = ImageDraw.Draw(img)
    for x in range(w):
        t = x / max(w - 1, 1)
        draw.line([(x, 0), (x, h)],
                  fill=(int(10 + t * 16), int(21 + t * 26), int(51 + t * 43)))

    def load(sz, bold=False):
        p = (r'C:\Windows\Fonts\arialbd.ttf' if bold else r'C:\Windows\Fonts\arial.ttf')
        try:    return ImageFont.truetype(p, sz)
        except: return ImageFont.load_default()

    def measure(txt, fnt):
        try:
            bb = draw.textbbox((0, 0), txt, font=fnt)
            return bb[2] - bb[0], bb[3] - bb[1]
        except:
            return len(txt) * 10, 16

    cy0   = (h - w) // 2
    cymid = cy0 + w // 2
    margin  = w // 14
    max_tcol = int(w * 0.47)
    circ_r  = int(w * 0.265)
    circ_cx = int(w * 0.785)
    circ_cy = cymid

    csz = circ_r * 2
    oc  = Image.new('RGB', (csz, csz), (20, 130, 155))
    od  = ImageDraw.Draw(oc)
    sky = int(csz * 0.40)
    for row in range(sky):
        t = row / max(sky, 1)
        od.line([(0, row), (csz, row)],
                fill=(int(130 + t*70), int(185 + t*35), int(215 + t*25)))
    for row in range(sky, csz):
        t = (row - sky) / max(csz - sky, 1)
        od.line([(0, row), (csz, row)],
                fill=(int(18 - t*6), int(135 - t*75), int(160 - t*70)))
    for row in range(sky + max(1, csz // 18), csz, max(1, csz // 10)):
        a  = 0.15 + 0.65 * ((row - sky) / max(csz - sky, 1))
        lc = int(85 * a)
        od.line([(0, row), (csz, row)], fill=(lc, lc + 58, lc + 80), width=max(1, csz // 85))

    bx   = max(6, csz // 22)
    bsz  = csz + bx * 2
    bimg = Image.new('RGB', (bsz, bsz), (7, 16, 38))
    bmsk = Image.new('L',   (bsz, bsz), 0)
    ImageDraw.Draw(bmsk).ellipse([0, 0, bsz-1, bsz-1], fill=255)
    bx0 = circ_cx - circ_r - bx;  by0 = circ_cy - circ_r - bx
    bx1 = bx0 + bsz;              by1 = by0 + bsz
    src_x0 = max(0, -bx0);  src_y0 = max(0, -by0)
    dst_x0 = max(0,  bx0);  dst_y0 = max(0,  by0)
    dst_x1 = min(w,  bx1);  dst_y1 = min(h,  by1)
    if dst_x1 > dst_x0 and dst_y1 > dst_y0:
        crop_w = dst_x1 - dst_x0;  crop_h = dst_y1 - dst_y0
        img.paste(bimg.crop((src_x0, src_y0, src_x0+crop_w, src_y0+crop_h)),
                  (dst_x0, dst_y0),
                  bmsk.crop((src_x0, src_y0, src_x0+crop_w, src_y0+crop_h)))

    cm = Image.new('L', (csz, csz), 0)
    ImageDraw.Draw(cm).ellipse([0, 0, csz-1, csz-1], fill=255)
    px0 = circ_cx - circ_r;  py0 = circ_cy - circ_r
    sx0 = max(0, -px0);      sy0 = max(0, -py0)
    dx0 = max(0,  px0);      dy0 = max(0,  py0)
    dx1 = min(w,  px0+csz);  dy1 = min(h,  py0+csz)
    if dx1 > dx0 and dy1 > dy0:
        cw_ = dx1 - dx0;  ch_ = dy1 - dy0
        img.paste(oc.crop((sx0, sy0, sx0+cw_, sy0+ch_)),
                  (dx0, dy0),
                  cm.crop((sx0, sy0, sx0+cw_, sy0+ch_)))

    fwm = load(int(w * 0.27), bold=True)
    vbb = draw.textbbox((0, 0), 'V', font=fwm)
    vw_ = vbb[2] - vbb[0];  vh_ = vbb[3] - vbb[1]
    wm_x = w - vw_ - w // 22
    wm_y = circ_cy + circ_r // 3
    ov   = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).text((wm_x, wm_y), 'V', fill=(255, 255, 255, 20), font=fwm)
    img_rgba = img.convert('RGBA')
    img_rgba.alpha_composite(ov)
    img  = img_rgba.convert('RGB')
    draw = ImageDraw.Draw(img)

    y = cy0 + w // 18
    fsp    = load(w // 27)
    sp_txt = 'FINANCIAL STRATEGY PARTNERS'
    _, sph = measure(sp_txt, fsp)
    draw.text((margin, y), sp_txt, fill=(64, 196, 196), font=fsp)
    y += sph + w // 28

    fb  = load(w // 12, bold=True)
    lns = (['From Vision', 'To Virtue'] if kind == 'intro' else ['Thank', 'You'])
    for ln in lns:
        draw.text((margin, y), ln, fill=(255, 255, 255), font=fb)
        _, lh = measure(ln, fb)
        y += lh + w // 65
    y += w // 30

    ft  = load(w // 31)
    tgl = ('In a journey as vast as the ocean, your company needs\n'
           "clear vision to reach land. Let's dive in."
           if kind == 'intro' else 'visionvirtuepartnership.com')
    for raw in tgl.split('\n'):
        words_q, cur = raw.split(), ''
        for wd in words_q:
            test = (cur + ' ' + wd).strip()
            if measure(test, ft)[0] <= max_tcol:
                cur = test
            else:
                if cur:
                    draw.text((margin, y), cur, fill=(200, 215, 235), font=ft)
                    _, ch = measure(cur, ft)
                    y += ch + w // 65
                cur = wd
        if cur:
            draw.text((margin, y), cur, fill=(200, 215, 235), font=ft)
            _, ch = measure(cur, ft)
            y += ch + w // 65

    return img


if __name__ == '__main__':
    img = _make_branded_image('intro', 1080, 1920)
    # Crop to visible square band for preview
    cy0 = (1920 - 1080) // 2
    crop = img.crop((0, cy0, 1080, cy0 + 1080))
    out = r'C:\Users\RaphaelHaim\Desktop\intro_preview_crop.png'
    crop.save(out)
    print('Saved cropped preview:', out)
    # Also save full portrait
    img.save(r'C:\Users\RaphaelHaim\Desktop\intro_preview_full.png')
    print('Saved full portrait:   C:\\Users\\RaphaelHaim\\Desktop\\intro_preview_full.png')
