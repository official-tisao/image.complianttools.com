path = 'apps/web/src/lib/TransformExpansion.svelte'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

original = content

# Fix all patterns where a closing tag is missing its final `>`
# Pattern: </button at end of line followed by newline+indentation+>
content = content.replace(
    '">Browse Files</button>\n      >\n    >\n  {/if}',
    '">Browse Files</button>\n  {/if}'
)

# Fix Replace image button
content = content.replace(
    "onclick={() => document.getElementById('file-input')?.click()}>Replace image</button>\n          >\n        </div>\n      </div>\n    </div>\n  </div>\n  {/if}\n",
    "onclick={() => document.getElementById('file-input')?.click()}>Replace image</button>\n        </div>\n      </div>\n    </div>\n  </div>\n  {/if}\n"
)

# Fix remaining </label and </span and </a patterns where > is on next line
# Pattern: </label\n        >\n      >\n    </div>{/if}
content = content.replace(
    '>Height <input type="number" min="1" bind:value={height} /></label>\n      >\n    </div>{/if}',
    '>Height <input type="number" min="1" bind:value={height} /></label>\n    </div>{/if}'
)

content = content.replace(
    '>Scale <input type="number" min="1" max="8" step="0.5" bind:value={scale} /></label\n    >{/if}',
    '>Scale <input type="number" min="1" max="8" step="0.5" bind:value={scale} /></label>{/if}'
)

content = content.replace(
    '>Radius <input type="number" min="0" bind:value={radius} /></label\n    >{/if}',
    '>Radius <input type="number" min="0" bind:value={radius} /></label>{/if}'
)

content = content.replace(
    '<label>Columns <input type="number" min="1" max="16" bind:value={columns} /></label\n    >{#if kind === \'collage\'}',
    '<label>Columns <input type="number" min="1" max="16" bind:value={columns} /></label>{#if kind === \'collage\'}'
)

content = content.replace(
    'label>Gap <input type="number" min="0" bind:value={gap} /></label\n        >{:else}',
    'label>Gap <input type="number" min="0" bind:value={gap} /></label>{:else}'
)

content = content.replace(
    'KB → {Math.round(entry.outputSize / 1024)} KB</span\n                >',
    'KB → {Math.round(entry.outputSize / 1024)} KB</span>'
)

content = content.replace(
    'Download</a\n      >',
    'Download</a>'
)

# Fix any remaining <button\n> pattern where > is on its own line
# Also fix any </button\n> pattern where closing > is missing
content = content.replace(
    'onclick={() => removeFile(index)}>Remove</button>\n              >\n              </li>',
    'onclick={() => removeFile(index)}>Remove</button>\n              </li>'
)

content = content.replace(
    "onclick={() => document.getElementById('file-input')?.click()}>Add more</button>\n          >\n        </aside>",
    "onclick={() => document.getElementById('file-input')?.click()}>Add more</button>\n        </aside>"
)

content = content.replace(
    '>Split Image</button>\n          >\n        </aside>',
    '>Split Image</button>\n        </aside>'
)

content = content.replace(
    '>Run locally\n    >\n  {/if}',
    '>Run locally\n    </button>\n  {/if}'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

if content != original:
    print("FIXED some tags")
else:
    print("NO CHANGES")
