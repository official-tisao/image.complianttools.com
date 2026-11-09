path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix line 521: </button</button -> </button>
content = content.replace(
    'onclick={() => removeFile(index)}>Remove</button>\n              >\n',
    'onclick={() => removeFile(index)}>Remove</button>\n'
)

# Fix line 530: </button\n          >\n</aside>
content = content.replace(
    "onclick={() => document.getElementById('file-input')?.click()}>Add more</button>\n          >\n        </aside>",
    "onclick={() => document.getElementById('file-input')?.click()}>Add more</button>\n        </aside>"
)

# Fix Split Image button: >Split Image</button>\n          >\n
content = content.replace(
    '>Split Image</button>\n          >\n        </aside>',
    '>Split Image</button>\n        </aside>'
)

# Fix Run locally button: >Run locally\n    >\n  {/if}
content = content.replace(
    '>Run locally\n    >\n  {/if}',
    '>Run locally\n    </button>\n  {/if}'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("DONE")
