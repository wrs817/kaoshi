#!/usr/bin/env python3
"""
Clean all generated CSV files in data/2026/:
1. Remove line-wrap artifacts in question/options fields
   (embedded \n followed by optional spaces that came from Excel cell word-wrap)
2. Fix OCR character garbles (口→门, 巧→订, 兰→三, W→以, 也→心, etc.)
3. Normalize extra whitespace around option labels
4. Fix trailing '0' that should be '（）'
"""

import csv, io, re, glob, os

# ── OCR garble substitution table ────────────────────────────────────────────
# Only applied in clearly wrong contexts to avoid over-replacing.
# Each entry is (pattern, replacement) applied via re.sub.
OCR_FIXES = [
    # 部口 → 部门  (most common: 财政部口, 主管部口, etc.)
    (r'部口', '部门'),
    # 单独的 口 before 户/网/碑 etc where 门 makes sense
    (r'口户', '门户'),
    # 签巧合同 → 签订合同
    (r'签巧', '签订'),
    # 兰 used as 三 (兰十 → 三十, 兰家 → 三家, 兰分之 → 三分之, etc.)
    (r'兰十', '三十'),
    (r'兰家', '三家'),
    (r'兰分之', '三分之'),
    (r'兰级', '三级'),
    (r'兰所', '三所'),
    (r'兰个', '三个'),
    # W以 pattern: standalone W used as 以 (W获取 → 以获取, W合同 → 以合同, etc.)
    # Only replace W that precedes a Chinese character
    (r'\bW(?=[^\s\w]|[\u4e00-\u9fff])', '以'),
    # 也 used as 心 (核也 → 核心)
    (r'核也', '核心'),
    # 中也 → 中心
    (r'中也', '中心'),
    # 局 used as 高 in some OCR (提局 → 提高)
    (r'提局', '提高'),
    # Sentence-ending '0' that represents '（）' blank fill-in marker
    # Only when preceded by Chinese and surrounded by context suggesting a blank
    (r'(?<=[\u4e00-\u9fff])\s*0\s*(?=[。？！」\n]|$)', '（）'),
    # '0。' at very end also
    (r'0([。？！])', r'（）\1'),
]


def fix_ocr(text: str) -> str:
    for pattern, replacement in OCR_FIXES:
        text = re.sub(pattern, replacement, text)
    return text


def clean_question(text: str) -> str:
    """Remove line-wrap artifacts: join lines that are continuation of same sentence."""
    # Replace \n followed by optional spaces with a single space
    # (These are Excel word-wrap line breaks, not intentional paragraph breaks)
    text = re.sub(r'\n\s*', '', text)
    # Normalize multiple spaces
    text = re.sub(r'  +', ' ', text)
    text = text.strip()
    return fix_ocr(text)


def clean_options(text: str) -> str:
    """Clean options: normalize spacing, remove wrap artifacts within each option."""
    if not text:
        return text

    # Step 0: Insert newline before every option marker that isn't already on its own line.
    # This handles space-separated options like "A. text B. text C. text" or
    # "A.text   B.text   C.text" (wide-space separated from xlsx cells).
    # Insert \n before B-G markers (not A, which is always first).
    text = re.sub(r'\s{2,}(?=[B-G][.．])', '\n', text)
    # Also handle cases where options are separated by single space with no newline:
    # e.g. "A. foo B. bar" → insert \n before B-G preceded by word char + space
    text = re.sub(r'(?<=\S)\s+(?=[B-G][.．]\s)', '\n', text)

    # Split on option boundaries (A. B. C. ... on its own line)
    # First, join any wrap-artifact lines within an option
    # Strategy: split by \n, then rejoin lines that don't start a new option
    lines = text.split('\n')
    merged = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Does this line start a new option? (A. B. C. D. E. F. G.)
        if re.match(r'^[A-G][.．]\s*', stripped):
            merged.append(stripped)
        else:
            # Continuation of previous option — append to last
            if merged:
                merged[-1] = merged[-1].rstrip() + stripped
            else:
                merged.append(stripped)

    # Now normalize spacing after the letter label
    cleaned = []
    for opt in merged:
        # Normalize "A.  text" → "A. text"
        opt = re.sub(r'^([A-G])[.．]\s+', r'\1. ', opt)
        opt = fix_ocr(opt)
        cleaned.append(opt)

    return '\n'.join(cleaned)


def clean_answer(text: str) -> str:
    text = re.sub(r'\s+', '', text)  # remove all whitespace
    return text.strip()


def clean_type(text: str) -> str:
    text = text.strip()
    return text


def process_file(path: str) -> tuple[int, int]:
    """Clean one CSV file in-place. Returns (rows_processed, rows_changed)."""
    with open(path, encoding='utf-8') as f:
        content = f.read()

    reader = csv.reader(io.StringIO(content))
    all_rows = list(reader)
    if not all_rows:
        return 0, 0

    header = all_rows[0]
    data_rows = all_rows[1:]

    changed = 0
    cleaned_rows = []
    for row in data_rows:
        if len(row) < 4:
            cleaned_rows.append(row)
            continue

        orig = row[:]
        row[0] = clean_type(row[0])
        row[1] = clean_question(row[1])
        row[2] = clean_options(row[2])
        row[3] = clean_answer(row[3])

        if row != orig:
            changed += 1
        cleaned_rows.append(row)

    # Write back
    out = io.StringIO()
    writer = csv.writer(out, quoting=csv.QUOTE_ALL)
    writer.writerow(header)
    for row in cleaned_rows:
        writer.writerow(row)

    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(out.getvalue())

    return len(cleaned_rows), changed


def main():
    csv_files = sorted(glob.glob(
        os.path.join(os.path.dirname(__file__), '2026', '*.csv')
    ))
    print(f'Cleaning {len(csv_files)} CSV files...\n')

    total_rows = total_changed = 0
    for path in csv_files:
        fname = os.path.basename(path)
        rows, changed = process_file(path)
        total_rows += rows
        total_changed += changed
        status = f'{changed:3d} rows changed' if changed else '  no changes  '
        print(f'  {status}  │  {fname}')

    print(f'\nDone. {total_changed}/{total_rows} rows cleaned across {len(csv_files)} files.')


if __name__ == '__main__':
    main()
