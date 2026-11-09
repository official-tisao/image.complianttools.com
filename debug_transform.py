import re

path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

print("=== Lines 504-533 ===")
for i in range(503, 533):
    print("Line {}: {}".format(i+1, lines[i]))

template_start = content.find('<main')
template_end = content.find('</main>', template_start)
if template_start >= 0 and template_end > template_start:
    template = content[template_start:template_end + 7]

print("\n=== Tag balance check ===")
span_pattern = re.findall(r'<span[^>]*>', template)
close_span_pattern = re.findall(r'</span>', template)
print("Open span tags: {}".format(len(span_pattern)))
print("Close span tags: {}".format(len(close_span_pattern)))

div_pattern = re.findall(r'<div[^>]*>', template)
close_div_pattern = re.findall(r'</div>', template)
print("Open div tags: {}".format(len(div_pattern)))
print("Close div tags: {}".format(len(close_div_pattern)))

button_pattern = re.findall(r'<button[^>]*>', template)
close_button_pattern = re.findall(r'</button>', template)
print("Open button tags: {}".format(len(button_pattern)))
print("Close button tags: {}".format(len(close_button_pattern)))

if_pattern = re.findall(r'\{#if\b', template)
end_if_pattern = re.findall(r'\{/if\}', template)
print("\n{{#if count: {}}}".format(len(if_pattern)))
print("{{/if count: {}}}".format(len(end_if_pattern)))

each_pattern = re.findall(r'\{#each\b', template)
end_each_pattern = re.findall(r'\{/each\}', template)
print("{{#each count: {}}}".format(len(each_pattern)))
print("{{/each count: {}}}".format(len(end_each_pattern)))

# Check for HTML comment issues
print("\n=== HTML comment check ===")
print("HTML comments in template: {}".format(template.count('<!--')))
print("HTML comment closes in template: {}".format(template.count('-->')))

# Check for any empty/missing attributes
print("\n=== Attribute check ===")
# Look for any tag starting with < but no >
incomplete_tags = re.findall(r'<[^>]*$', template, re.MULTILINE)
print("Lines with incomplete tags: {}".format(len(incomplete_tags)))

print("\n=== Done ===")
