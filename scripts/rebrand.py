#!/usr/bin/env python3
"""Rename the product everywhere it is the product, keep it where it is Lyzr's brief.
Usage: python3 scripts/rebrand.py "Name" name-slug [--dry]
"""
import os, re, sys

NAME, SLUG = sys.argv[1], sys.argv[2]
DRY = "--dry" in sys.argv
ROOTS = ["app", "components", "lib", "tests", "scripts"]
SKIP_DIRS = {"concepts"}
EXT = (".ts", ".tsx", ".mjs", ".css")

def keep(line: str) -> bool:
    # Mentions of the assignment itself, or of architecture as a concept.
    return "Lyzr" in line or "architect.new" in line

def swap(line: str) -> str:
    if keep(line):
        return line
    line = line.replace("Architect 2.0", NAME)
    line = line.replace("Architect Cloud", f"{NAME} Cloud")
    line = line.replace("Architect's", f"{NAME}'s")
    line = line.replace("Architect’s", f"{NAME}’s")
    line = re.sub(r"\bArchitect\b(?!ure)", NAME, line)
    line = line.replace("@architect/cli", f"@{SLUG}/cli")
    line = line.replace(".architect.app", f".{SLUG}.app")
    line = line.replace("cname.architect.new", f"cname.{SLUG}.app")
    return line

changed = []
for root in ROOTS:
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files:
            if not f.endswith(EXT) or f == "rebrand.py":
                continue
            p = os.path.join(d, f)
            src = open(p).read()
            out = "\n".join(swap(l) for l in src.split("\n"))
            if out != src:
                changed.append(p)
                if not DRY:
                    open(p, "w").write(out)
print(("would change" if DRY else "changed"), len(changed), "files")
for p in changed:
    print(" ", p)
