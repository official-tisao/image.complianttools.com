import re

path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the Run locally button (lines 565-568)
pattern1 = '>Run locally\n    >\n'
pattern1_fix = '>Run locally\n  </button>\n'
content = re.sub(pattern1, pattern1_fix, content)

# Fix the split-image button (lines 542-543)
pattern2 = '>Split Image\n    >\n'
pattern2_fix = '>Split Image\n  </button>\n'
content = re.sub(pattern2, pattern2_fix, content)

# Fix the Remove button (line 521)
pattern3 = r'onclick=\(\) => removeFile\(index\)>Remove</button>\n\s*>'
pattern3_fix = r'onclick={() => removeFile(index)}>Remove</button>\n'
content = re.sub(pattern3, pattern3_fix, content)

# Fix the Add more images button (line 530)
pattern4 = r'onclick=\(\) => document\.getElementById\(.file-input.\)\?.click\(\)>Add more</button>\n\s*>'
pattern4_fix = "onclick={() => document.getElementById('file-input')?.click()}>Add more</button>\n"
content = re.sub(pattern4, pattern4_fix, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("DONE")
