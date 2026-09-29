#!/usr/bin/env python3
"""Собирает веб-версии архива из "Photo/Color BW" в MM/site/img + манифест.

Две коллекции: bw и color. Порядок внутри каждой задан вручную ниже —
кадры выстроены так, чтобы перекликались между собой, а не по алфавиту.
Идемпотентен: просто перезапусти после правок.
"""
import json
import re
import shutil
import time
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Photo" / "Color BW"
OUT = ROOT / "site" / "img"

# Лестница ширин. Браузер сам берёт нужную ступень через srcset:
# кадр шириной 999css на ретине требует ~2000px, одного превью не хватает.
LADDER = [(480, 76), (960, 80), (1440, 82), (2400, 84)]
FALLBACK_W = 1440          # единственный JPEG — на случай браузера без WebP
BG_EDGE = 3000

# Фоны секций — их задал автор, из галерей они исключены.
BACKDROPS = {"bw": "1.jpg", "color": "2.jpg"}

# Порядок кадров. Высокий ключ и графика на входе, потом выпускной, вода,
# город, ночь, зима; закрывается смазом и поездом.
ORDER_BW = [
    "000005.jpg", "R1-06-2.jpg", "R1-08038-0014.jpg", "DSCF5824.jpg", "R1-08038-0009.jpg",
    "DSCF8552 копия.jpg", "DSCF8561 копия.jpg", "DSCF8385 копия.jpg", "DSCF8395 копия.jpg",
    "DSCF8206 копия.jpg",
    "DSCF8959 копия.jpg", "DSCF8896 копия.jpg", "R1-02502-0006.jpg", "R1-06790-0004.jpg",
    "DSCF8930 копия.jpg", "R1-02502-0028.jpg", "DSCF9297 копия.jpg",
    "DSCF5944.jpg", "DSCF8792 копия.jpg", "R1-02481-012A.jpg", "DSCF0313.jpg", "DSCF0317.jpg",
    "DSCF5769.jpg",
    "IMG_0029.jpg", "R1-04997-0002.jpg", "DSCF4344.jpg", "DSCF7119-2.jpg", "R1-01.jpg",
    "R1-13.jpg", "R1-04-2.jpg", "R1-04168-0012.jpg", "R1-04168-0020.jpg", "R1-11.jpg", "R1-18.jpg",
    "IMG_0119.jpg", "R1-02481-026A.jpg", "R1-08038-0004.jpg", "R1-00175-0009.jpg",
    "R1-00175-0025.jpg", "R1-02504-0036.jpg", "R1-08038-0003.jpg", "R1-22.jpg", "R1-23-2.jpg",
]

# От приглушённой зимы к ночному свету, дальше яркое и город,
# закрывается абстракцией на воде.
ORDER_COLOR = [
    "R1-05784-0006.jpg", "R1-05784-0013.jpg", "R1-05784-0012.jpg", "R1-04168-0005.jpg",
    "R1-00176-0021.jpg",
    "R1-03283-0012.jpg", "R1-03283-0009.jpg", "R1-09661-028A.jpg", "R1-08101-017A.jpg",
    "R1-04168-0027.jpg",
    "DSCF4919 копия.jpg", "R1-09661-008A.jpg", "R1-09661-017A.jpg", "R1-09660-0019.jpg",
    "R1-04168-0015-2.jpg", "DSCF9296 копия.jpg",
    "R1-08101-006A.jpg", "R1-08101-008A.jpg", "R1-08101-014A.jpg", "R1-08101-021A.jpg",
    "R1-08101-024A.jpg", "R1-08101-028A.jpg",
    "R1-08011-022A.jpg", "R1-08011-020A.jpg", "R1-02480-0001.jpg", "R1-09660-0029.jpg",
]

COLLECTIONS = [("bw", "BW", ORDER_BW), ("color", "Color", ORDER_COLOR)]


def resized(img, width):
    """Уменьшает по ширине и подшарпливает тем сильнее, чем больше ужали:
    без этого зерно замыливается, а здесь оно и есть содержание."""
    if img.width <= width:
        v = img.copy()
    else:
        h = round(img.height * width / img.width)
        v = img.resize((width, h), Image.LANCZOS)
        k = min(img.width / width, 4.0)
        v = v.filter(ImageFilter.UnsharpMask(
            radius=0.6, percent=int(18 + 12 * k), threshold=2))
    return v


def save_ladder(img, stem, out_dir):
    """Пишет все ступени лестницы и возвращает готовую строку srcset."""
    parts = []
    for width, q in LADDER:
        if width > img.width * 1.15 and parts:
            break                      # не раздуваем то, чего нет в оригинале
        v = resized(img, min(width, img.width))
        d = out_dir / f"w{width}"
        (d / stem.parent).mkdir(parents=True, exist_ok=True)
        v.save(d / f"{stem}.webp", "WEBP", quality=q, method=6)
        parts.append((f"img/w{width}/{stem}.webp", v.width, v.height))
        if width == FALLBACK_W:
            v.save(d / f"{stem}.jpg", "JPEG", quality=q,
                   progressive=True, optimize=True)
    srcset = ", ".join(f"{u} {w}w" for u, w, _ in parts)
    fb = next((u for u, w, _ in parts if f"/w{FALLBACK_W}/" in u), parts[-1][0])
    return srcset, fb.replace(".webp", ".jpg"), parts[-1][1], parts[-1][2]


def save_bg(img, base):
    v = resized(img, min(BG_EDGE, img.width))
    base.parent.mkdir(parents=True, exist_ok=True)
    v.save(base.with_suffix(".webp"), "WEBP", quality=82, method=6)
    v.save(base.with_suffix(".jpg"), "JPEG", quality=80, progressive=True, optimize=True)


def load(path, mono):
    with Image.open(path) as raw:
        # EXIF тут недостоверен, но ориентацию уважаем до ресайза.
        img = ImageOps.exif_transpose(raw)
        # Чёрно-белую коллекцию приводим к честному grayscale: часть плёночных
        # сканов тонирована. Цветную не трогаем — там тон и есть содержание.
        return img.convert("L" if mono else "RGB")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)

    photos = []
    for slug, folder, order in COLLECTIONS:
        d = SRC / folder
        on_disk = {p.name: p for p in d.iterdir()
                   if p.suffix.lower() in {".jpg", ".jpeg", ".png"}}
        mono = slug == "bw"

        backdrop = BACKDROPS[slug]
        if backdrop in on_disk:
            img = load(on_disk.pop(backdrop), mono)
            save_bg(img, OUT / "bg" / slug)
            print(f"[{slug}] фон: {backdrop}")
        else:
            print(f"[{slug}] ВНИМАНИЕ: фон {backdrop} не найден")

        missing = [n for n in order if n not in on_disk]
        if missing:
            print(f"[{slug}] ВНИМАНИЕ: в порядке есть отсутствующие файлы: {missing}")
        # Всё, что не попало в ручной порядок, дописываем в конец, чтобы
        # добавленные кадры не пропадали молча.
        extra = sorted(n for n in on_disk if n not in order)
        if extra:
            print(f"[{slug}] вне заданного порядка, добавлены в конец: {extra}")

        for n, name in enumerate([x for x in order if x in on_disk] + extra, 1):
            pid = f"{slug}-{n:02d}"
            img = load(on_disk[name], mono)
            srcset, fb, w, h = save_ladder(img, Path(slug) / pid, OUT)
            photos.append({
                "id": pid,
                "collection": slug,
                "n": n,
                "srcset": srcset,
                "fb": fb,
                "w": w, "h": h,
                "full": [img.width, img.height],
                "orient": "square" if w == h else ("land" if w > h else "port"),
            })

    site = ROOT / "site"
    blob = json.dumps(photos, ensure_ascii=False, indent=1)
    (site / "photos.json").write_text(blob + "\n", encoding="utf-8")
    (site / "assets" / "js" / "photos.js").write_text(
        "/* Сгенерировано tools/build_images.py — не править руками. */\n"
        "/* Данные вшиты в JS, а не в JSON: fetch() не работает по file://. */\n"
        f"window.PHOTOS = {blob};\n",
        encoding="utf-8")

    # Штамп версии у css/js: иначе после заливки посетители с прогретым
    # кэшем получат старые данные к новой разметке.
    stamp = str(int(time.time()))
    index = site / "index.html"
    html = index.read_text(encoding="utf-8")
    html = re.sub(r'(assets/(?:css|js)/[\w.-]+\.(?:css|js))(\?v=\d+)?',
                  lambda m: f"{m.group(1)}?v={stamp}", html)
    index.write_text(html, encoding="utf-8")

    for slug, _, _ in COLLECTIONS:
        print(f"{slug}: {sum(1 for p in photos if p['collection'] == slug)} кадров")
    print(f"версия ресурсов: {stamp}")


if __name__ == "__main__":
    main()
