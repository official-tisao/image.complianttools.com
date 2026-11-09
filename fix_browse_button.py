path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 479-480 (index 478-479): the browse files button
# Current:
#   Line 479:         }}>Browse Files</button
#   Line 480:       >
# Should be:
#   Line 479:         }}>Browse Files</button>
# (remove the stray > on line 480)

# The opening <button> tag on line 472 is missing its closing >
# We need to add > after the onclick handler closes

# Let's look at the structure:
# Line 472: <button
# Line 473-478: attributes and onclick
# Line 479: }}>Browse Files</button
# Line 480: >

# Fix: add > to line 478 (after onclick closes), change line 479 to proper close, remove line 480

# Line 478 (index 477): '        document.getElementById('file-input')?.click();'
# Add closing > for the button tag after the onclick
lines[477] = "        document.getElementById('file-input')?.click();\n"
# The > was at line 479 (index 478) but it was part of the closing
# Line 479 currently: '        }}>Browse Files</button'
# Should be: '        }}>Browse Files</button>\n'
lines[478] = '        }}>Browse Files</button>\n'
# Remove line 480 (index 479) which is the stray >
del lines[479]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed browse button")