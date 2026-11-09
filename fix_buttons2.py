path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Lines are 1-indexed
# Line 521 (index 520): onclick={() => removeFile(index)}>Remove</button
# Line 522 (index 521): >
# Line 530 (index 529): onclick={() => document.getElementById('file-input')?.click()}>Add more</button
# Line 531 (index 530): >
# Line 542 (index 541): >Split Image</button
# Line 543 (index 542): >
# Line 566 (index 565): >Run locally
# Line 567 (index 566): >

fixes_applied = []

# Fix line 521: close </button</button
if '</button' in lines[520]:
    lines[520] = lines[520].rstrip('\n').rstrip() + '>\n'
    fixes_applied.append('Line 521: closed </button>')

# Remove line 522 (just >)
if lines[521].strip() == '>':
    del lines[521]
    fixes_applied.append('Removed line 522 (stray >)')

# Now indices shifted by 1 after deletion above

# Fix line 530 (was 530, now 529 after deletion): onclick...Add more</button
if 'Add more</button' in lines[529]:
    lines[529] = lines[529].rstrip('\n').rstrip() + '>\n'
    fixes_applied.append('Line 530: closed Add more </button>')

# Remove next line if just >
if len(lines) > 530 and lines[530].strip() == '>':
    del lines[530]
    fixes_applied.append('Removed stray > after Add more button')

# Fix Split Image button (was line 542, need to re-find)
for i, line in enumerate(lines):
    if '>Split Image</button' in line:
        lines[i] = line.rstrip('\n').rstrip() + '>\n'
        fixes_applied.append(f'Line {i+1}: closed Split Image </button>')
        # Check next line
        if i+1 < len(lines) and lines[i+1].strip() == '>':
            del lines[i+1]
            fixes_applied.append(f'Removed stray > at line {i+2}')
        break

# Fix Run locally button
for i, line in enumerate(lines):
    if '>Run locally' in line and 'onclick' not in line:
        lines[i] = line.rstrip('\n').rstrip() + '\n'
        fixes_applied.append(f'Line {i+1}: fixed Run locally button opening tag')
        # Check if next lines contain the stray >
        if i+1 < len(lines) and lines[i+1].strip() == '>':
            del lines[i+1]
            fixes_applied.append(f'Removed stray > at line {i+2}')
        break

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

for fix in fixes_applied:
    print(fix)
