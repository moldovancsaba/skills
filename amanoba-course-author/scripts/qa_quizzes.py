import re
import sys
from pathlib import Path

COURSE_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else None

if not COURSE_DIR or not COURSE_DIR.exists():
    print("Usage: qa_quizzes.py <course_dir>")
    sys.exit(2)

QUIZ_PATTERN = re.compile(r"^lesson-(\d{2})-.*-quiz\.md$")

errors = []

for path in sorted(COURSE_DIR.iterdir()):
    if not path.is_file():
        continue
    if not QUIZ_PATTERN.match(path.name):
        continue

    text = path.read_text(encoding="utf-8")
    blocks = [b.strip() for b in text.split("\n---\n") if "**Question:**" in b]
    if len(blocks) < 7:
        errors.append((path.name, f"only {len(blocks)} questions (expected >=7)"))
        continue

    for i, block in enumerate(blocks, start=1):
        q_match = re.search(r"\*\*Question:\*\*\s*(.*)", block)
        if not q_match:
            errors.append((path.name, f"Q{i}: missing question"))
            continue
        q_text = q_match.group(1).strip()
        if len(q_text) < 40:
            errors.append((path.name, f"Q{i}: question too short"))

        options = re.findall(r"^[A-D]\)\s+(.*)$", block, re.M)
        if len(options) != 4:
            errors.append((path.name, f"Q{i}: expected 4 options, got {len(options)}"))
        for opt in options:
            if len(opt.strip()) < 25:
                errors.append((path.name, f"Q{i}: option too short"))

        correct_match = re.search(r"\*\*Correct:\*\*\s*([A-D])", block)
        if not correct_match:
            errors.append((path.name, f"Q{i}: missing correct answer"))

        if re.search(r"\ball of the above\b|\bnone of the above\b", block, re.I):
            errors.append((path.name, f"Q{i}: forbidden option wording"))

        if re.search(r"\bthis lesson\b|\btoday\b|\bday \d+\b|\bmodule\b|\bcourse\b", block, re.I):
            errors.append((path.name, f"Q{i}: references lesson or course"))

print(f"Checked quizzes in {COURSE_DIR}")
if errors:
    print("FAIL")
    for e in errors:
        print(f"- {e[0]}: {e[1]}")
    sys.exit(1)
else:
    print("PASS")
