import re

path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Check all lines for malformed HTML/Svelte tags
for i, line in enumerate(lines, 1):
    stripped = line.strip()
    # Skip comment/script/style/content
    if stripped.startswith('{') and stripped.endswith('}'):
        continue
    if stripped.startswith('<!--') or stripped.startswith('-->'):
        continue
    if '<script' in line or '</script>' in line:
        continue
    if '<style' in line or '</style>' in line:
        continue
    if '<main' in line and '>' in line:
        continue
    if '</main>' in line:
        continue
    # Check for lines ending with incomplete tag
    if re.search(r'</[a-zA-Z]+\s*$', stripped) and not stripped.endswith('>'):
        print(f"Line {i}: MALFORMED CLOSING TAG: {line.rstrip()}")
    # Check for lines with open tag that never closes
    open_tags = re.findall(r'<[a-zA-Z][^>]*$', stripped)
    for tag in open_tags:
        print(f"Line {i}: INCOMPLETE OPEN TAG: {tag}")
    # Check for self-closing tags missing >
    if '<label' in stripped and not stripped.rstrip().endswith('/>') and not stripped.rstrip().endswith('>'):
        print(f"Line {i}: UNCLOSED LABEL: {line.rstrip()}")
    if '</span' in stripped and not stripped.rstrip().endswith('>'):
        print(f"Line {i}: UNCLOSED SPAN CLOSE: {line.rstrip()}")

print("\n=== Done scanning ===")