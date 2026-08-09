# Minibox SaaS Template — Design System

This document captures the shared visual language found across the saved HTML templates, especially `style-guide.htm` and the three home-page variants. Use it as the implementation reference when extending or recreating the template.

## Design direction

Minibox is a restrained, editorial SaaS/banking interface. It pairs a warm off-white canvas with near-black type, generous whitespace, subtly rounded panels, and occasional dark, textured product surfaces. The personality is confident and quiet rather than glossy: large, tight headlines; simple geometric icons; muted supporting copy; and product imagery that feels embedded into the page rather than framed as decoration.

## Foundations

### Colour

| Role | Value | Use |
| --- | --- | --- |
| Canvas / alabaster | `#F0EEEA` | Default page background |
| Ink / eerie black | `#1C1A17` | Primary text, dark sections, primary CTA |
| White | `#FFFFFF` | Cards, inverse surfaces, CTA text |
| Secondary ink / outer space | `#464442` | Secondary text and light borders |
| Platinum | `#EBE6DE` | Soft panels and swatches |
| Dark raised surface | `#25221E` | Cards/inputs inside dark sections |
| Dark surface variant | `#282420` | Dark feature-card background |
| Muted text | `#5C5A56` / `70–80%` ink | Supporting copy and links |
| Hairline | `#1C1A1712` / `#1C1A171A` | Dividers, chips, quiet structure |
| Accent card washes | `#D6E0EA`, `#E3DED0`, `#D3E2CF` | Feature-card backgrounds |

Do not introduce a saturated brand accent as a default UI colour. Colour is used structurally: pale neutral pages, near-black emphasis, white content cards, and occasional subdued pastel feature panels.

### Typography

Use **Geist, sans-serif** throughout. Headlines use weight 500 with negative tracking; body copy is regular 400. Use 600 only for modest emphasis and 700+ sparingly.

| Token | Desktop | Tablet (≤991px) | Mobile (≤767px) | Small mobile (≤479px) |
| --- | --- | --- | --- | --- |
| H1 | 56 / 64, -2.8px | 44 / 52 | 38 / 46, -2px | 32 / 40, -2px |
| H2 | 44 / 50, -2.2px | 36 / 44 | 32 / 40, -1.5px | 28 / 36, -0.15px |
| H3 | 40 / 48, -1.2px | 32 / 40 | 28 / 36 | 24 / 32 |
| H4 | 32 / 40, -0.64px | 26 / 36 | 24 / 30 | 22 / 28 |
| H5 | 20 / 28, -1.08px | 18 / 26 | 16 / 24 | 15 / 22 |
| H6 | 18 / 28, -0.72px | 16 / 26 | 15 / 24 | 14 / 22 |
| Body large | 20 / 28, -0.36px | 18 / 26 | 16 / 24 | 15 / 22 |
| Body | 18 / 28, -0.32px | 16 / 26 | 15 / 24 | 14 / 22 |
| UI / body small | 16 / 24, -0.36px | 15 / 22 | 14 / 20 | 14 / 18 |
| Caption | 14 / 20, +0.14px | 14 / 18 | 14 / 18, -0.4px | 14 / 18, -0.4px |

Headlines should be compact, usually no wider than 630–800px when centred. Supporting copy normally sits at 70–80% opacity and is constrained to preserve a calm, readable measure.

### Layout and spacing

The main container is `max-width: 1280px`, centred, with horizontal inset that changes by breakpoint:

| Breakpoint | Side padding | Hero top offset | Large section rhythm |
| --- | ---: | ---: | ---: |
| Desktop | 40px | 156px | 120–160px |
| ≤991px | 32px | 140px | 100px |
| ≤767px | 24px | 120px | 80px |
| ≤479px | 16px | 110px | 60px |

Use an 4px-based scale. Frequent gaps are 8, 12, 16, 20, 24, 32, 40, 48, 60, 80, 100, 120, 140, and 160px. Major sections breathe; inside cards, use 20–32px; between heading and copy, use 10–12px.

The base radius is **8px** for panels, images, and CTA containers; image cards may use 12px. Pills and primary buttons use a fully rounded 50–100px radius. Borders are thin, low-contrast, and never heavy.

## Core components

### Header and navigation

The header is absolutely positioned over the top of the page, with 16px vertical padding. The desktop layout is three-part: brand on the left, centred navigation, and a single action on the right. The logo is 32px high; the primary navigation uses 16px text with ~28px item gaps.

Navigation categories open spacious white dropdown panels that include a title and muted explanatory caption. At tablet width the nav collapses to a bordered 8px-radius menu button; the opened menu becomes a white vertical panel.

### Buttons and links

The main action is a dark, rounded pill with 8px × 28px padding and white 16px label text. Its hover treatment swaps/reveals a second label and uses a moving rounded overlay, so interaction should feel like a quick, refined slide—not a colour flash. Secondary buttons use the same pill geometry with ink text and either a transparent or thin outlined treatment.

Text links are mostly undecorated in UI contexts; footer links are 70% opaque and become fully opaque on hover. Social controls are 32px circular buttons, with 16px icons.

### Cards and imagery

- **Feature cards:** three-up grids, 8px radius, soft blue/sand/green washes, 24–32px internal padding, simple logo/icon at top and text anchored lower in the card.
- **Dark feature cards:** charcoal `#25221E` surfaces on an ink section, white text, and product imagery fading into the card via a bottom gradient.
- **Editorial/blog cards:** image-first, 8px radius, no strong border or shadow. The featured article uses a two-column image/content composition; supporting articles use compact horizontal or three-column layouts.
- **Testimonials:** white, image-topped cards with 8px radius; photo area around 316px high; cards sit in a horizontally scrolling/slider composition.
- **Product/dashboard surfaces:** dark or photographic textured panels, large crop, clipped with 8px radius. Tabs float over the surface as translucent grey pills and turn white when active.

Avoid drop shadows. Separation comes from background contrast, radius, spacing, and thin translucent dividers.

### Forms

Forms are minimal: transparent fields on dark raised input surfaces, with a soft 8px container and no visible heavy focus chrome. Newsletter modules are ink panels with white type and a `#25221E` field well. Keep labels/captions compact and supporting copy muted.

### Footer and conversion CTA

End marketing pages with a full-width, 8px-radius dark patterned CTA panel. Centre a large inverse headline (CTA content max width ~790px), short supporting text, pill actions, and a compact customer-logo strip.

The footer returns to the warm light canvas. It has a brand column and four slim link columns, each with an uppercase-ish 16px heading and a 1px translucent top divider before the links. A final horizontal rule separates the social row and copyright.

## Page composition

Home pages share this narrative sequence:

1. An airy centred hero: product-led H1, short explanation, primary/secondary calls to action, and social proof.
2. A broad dashboard/product image that grounds the promise.
3. Feature or outcome cards, often alternating light and ink sections.
4. A two-column product/story block that pairs a concise text stack with a large visual panel.
5. Logos, testimonials, integrations, and recent articles as credibility modules.
6. The dark conversion CTA and footer.

Use centred compositions for high-level promises and two-column compositions for explanatory/product sections. In editorial content, reserve wide whitespace around the article body and use a sticky right-side newsletter/share rail on desktop.

## Responsive rules

- Preserve the full-width visual rhythm, but reduce the token scale rather than simply shrinking every element.
- At ≤991px, collapse the header navigation and convert dense desktop grids to fewer columns where space requires it.
- At ≤767px, stack major two-column content, use three-column card grids only when individual cards still have room, and keep 24px page insets.
- At ≤479px, use 16px page insets, two-column colour/card grids at most, and stack core content in a single readable column.
- Keep large product imagery cropped and rounded; do not force it to show every detail at narrow widths.
- CTA button groups may wrap, but retain pill proportions and at least a 10–12px gap.

## Implementation checklist

- Set the body to `#F0EEEA`, Geist, 16px/24px on desktop.
- Use the documented responsive type and spacing tokens instead of ad-hoc values.
- Cap core content at 1280px; cap centred hero copy around 630–800px.
- Reserve dark ink for high-emphasis sections, primary actions, dashboards, and conversion CTA panels.
- Use 8px radii and no conventional box shadows.
- Keep visual hierarchy dependent on scale, white space, and opacity—not bold colours or elaborate effects.

## Source files

- `style-guide.htm` is the canonical token/component reference.
- `home-01.htm`, `home-02.htm`, and `home-03.htm` demonstrate the landing-page variants.
- `style-guide_files/minibox.webflow.shared.c9bae7893.css` contains the source CSS variables, component rules, and breakpoints used for this document.
