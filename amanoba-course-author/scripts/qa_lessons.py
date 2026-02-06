import re
import sys
from pathlib import Path

COURSE_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else None

if not COURSE_DIR or not COURSE_DIR.exists():
    print("Usage: qa_lessons.py <course_dir>")
    sys.exit(2)

LESSON_PATTERN = re.compile(r"^lesson-(\d{2})-.*\.md$")

required_sections = [
    "## Learning goal",
    "## Who",
    "## What",
    "## Where",
    "## When",
    "## Why it matters",
    "## How",
    "## Guided exercise",
    "## Independent exercise",
    "## Self-check",
    "## Bibliography",
]

errors = []

for path in sorted(COURSE_DIR.iterdir()):
    if not path.is_file():
        continue
    if path.name.endswith("-quiz.md"):
        continue
    if not LESSON_PATTERN.match(path.name):
        continue

    text = path.read_text(encoding="utf-8")

    # Required heading
    if not text.startswith("# Lesson "):
        errors.append((path.name, "missing lesson header"))

    # Required sections
    for sec in required_sections:
        if sec not in text:
            errors.append((path.name, f"missing section: {sec}"))

    # Required Who/What/Where/When/Why/How blocks
    for sec in ["## Who","## What","## Where","## When","## Why it matters","## How"]:
        if sec not in text:
            errors.append((path.name, f"missing block: {sec}"))

    # Exactly one table
    table_count = len(re.findall(r"\n\|.+\|\n\|[-: ]+\|", text))
    if table_count != 1:
        errors.append((path.name, f"table count {table_count} (expected 1)"))

    # Exactly one callout
    callout_count = len(re.findall(r"^> \*\*(Pro tip|Common mistake):\*\*", text, re.M))
    if callout_count != 1:
        errors.append((path.name, f"callout count {callout_count} (expected 1)"))

    # Check paragraph length rule (rough)
    # Flag any paragraph with more than 3 lines
    paragraphs = re.split(r"\n\n+", text)
    for p in paragraphs:
        lines = p.strip().splitlines()
        if len(lines) > 3 and not lines[0].startswith("#") and not lines[0].startswith("-") and not lines[0].startswith("|"):
            errors.append((path.name, "paragraph longer than 3 lines"))
            break

print(f"Checked lessons in {COURSE_DIR}")
if errors:
    print("FAIL")
    for e in errors:
        print(f"- {e[0]}: {e[1]}")
    sys.exit(1)
else:
    print("PASS")
