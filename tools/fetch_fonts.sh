#!/bin/bash
# Тянет woff2 в site/assets/fonts, чтобы сайт работал офлайн и переносился папкой.
# Если сети нет — не страшно: в CSS прописан системный фоллбэк.
set -u
cd "$(dirname "$0")/.." || exit 1
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
API="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;500;600&family=Martian+Mono:wght@400;500&display=swap"

mkdir -p site/assets/fonts
if ! curl -sS --max-time 20 -A "$UA" "$API" -o /tmp/gf.css; then
  echo "нет сети — остаёмся на системных шрифтах"; exit 0
fi

python3 - <<'PY'
import hashlib, re, subprocess
from pathlib import Path

DST = Path("site/assets/fonts")
# Сайт русский: без кириллического субсета заголовки уедут в системный шрифт.
WANT = ("latin", "cyrillic")

css = Path("/tmp/gf.css").read_text(encoding="utf-8")
blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S)

seen_url, by_hash = {}, {}
for subset, face in blocks:
    if subset not in WANT:
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", face).group(1).replace(" ", "-")
    wght = re.search(r"font-weight:\s*(\d+)", face).group(1)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", face).group(1)
    if url in seen_url:
        continue
    seen_url[url] = True

    blob = subprocess.run(["curl", "-sS", "--max-time", "20", url],
                          capture_output=True, check=True).stdout
    # Начертания одного семейства часто приходят одним вариативным файлом —
    # складывать три копии незачем.
    digest = hashlib.md5(blob).hexdigest()
    if digest in by_hash:
        continue
    out = DST / f"{fam}-{subset}-{wght}.woff2"
    out.write_bytes(blob)
    by_hash[digest] = out.name
    print(f"  {out.name}  {len(blob)} b")
PY
