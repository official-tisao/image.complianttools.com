# Contrast assertion — P6-08

Source: packages/ui/src/tokens.css. Thresholds (README §20): body >=7:1 AAA / >=4.5:1 AA; UI/graphical >=3:1.
Pairs: --c-text/--c-bg, --c-text-muted/--c-bg, --c-text/--c-surface, --c-accent/--c-bg, --c-on-accent/--c-accent, --c-danger/--c-bg.
Method: oklch luminance, alpha resolved over --c-bg. Failures identify pair + ratio.
Status: assertions implemented; zero failures on token set.
