import re

path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix all remaining patterns where closing > is on a separate line
# Pattern: </tag\n    >\n  {/if}  -> </tag>\n  {/if}
content = re.sub(r'(</label)\n\s*>\n', r'\1>\n', content)
content = re.sub(r'(</span)\n\s*>\n', r'\1>\n', content)
content = re.sub(r'(</button)\n\s*>\n', r'\1>\n', content)
content = re.sub(r'(</a)\n\s*>\n', r'\1>\n', content)

# Fix opening tags that are missing >:
# Pattern: <button\n  type="button"\n  ... > content </button
# The > is already present on the line with onclick, so just need to close the tag properly

# Fix the <button\n  type="button"\n  ... >Browse Files</button\n      > pattern
content = content.replace(
    '<button\n  type="button"\n  class="button primary"\n  aria-label="Browse files"\n  onclick={(e: MouseEvent) => {\n    e.stopPropagation();\n    document.getElementById(\'file-input\')?.click();\n  }}>Browse Files</button\n      >',
    '<button\n  type="button"\n  class="button primary"\n  aria-label="Browse files"\n  onclick={(e: MouseEvent) => {\n    e.stopPropagation();\n    document.getElementById(\'file-input\')?.click();\n  }}>Browse Files</button>'
)

# Fix the <button\n  type="button"\n  ... >Replace image</button\n          > pattern
content = content.replace(
    '<button\n  type="button"\n  class="button secondary replace-button"\n  aria-label="Replace uploaded image"\n  onclick={() => document.getElementById(\'file-input\')?.click()}>Replace image</button\n          >',
    '<button\n  type="button"\n  class="button secondary replace-button"\n  aria-label="Replace uploaded image"\n  onclick={() => document.getElementById(\'file-input\')?.click()}>Replace image</button>'
)

# Fix any remaining </button>\n\s*> patterns
content = re.sub(r'(</button)\n\s*>\n', r'\1>\n', content)

# Fix any remaining </label>\n\s*> patterns
content = re.sub(r'(</label)\n\s*>\n', r'\1>\n', content)

# Fix any remaining </span>\n\s*> patterns
content = re.sub(r'(</span)\n\s*>\n', r'\1>\n', content)

# Fix any remaining </a>\n\s*> patterns
content = re.sub(r'(</a)\n\s*>\n', r'\1>\n', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("ALL FIXES APPLIED")