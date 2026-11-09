path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

template_start = content.find('<main')
template_end = content.find('</main>', template_start)
template = content[template_start:template_end + 7]

import re
# Find lines ending with <tag> without >
lines = template.split('\n')
print("Lines ending with incomplete tags:")
for i, line in enumerate(lines):
    if re.search(r'<[^>]*\s*$', line) and not re.search(r'<[^>]*>\s*$', line):
        # Skip lines that are just {#if} etc
        stripped = line.strip()
        if stripped.startswith('{') and stripped.endswith('}'):
            continue
        print(f"  Line in template {i+1}: {line}")

print("\n=== Remaining incomplete closing tags ===")
for i, line in enumerate(lines):
    if '</label' in line and line.strip().endswith('</label'):
        print(f"  Line {i+1}: {line}")
    if '</span' in line and line.strip().endswith('</span'):
        print(f"  Line {i+1}: {line}")
    if '</button' in line and line.strip().endswith('</button'):
        print(f"  Line {i+1}: {line}")

print("\n=== Done ===")
