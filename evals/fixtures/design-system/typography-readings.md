# Design System

> Phyllum manages this file. It is the single source of truth for this project's design system.

- Project: acme-web
- Phyllum version: 0.7.3
- Created: 2026-08-12

## Tokens

### Colours

| token | value |
| --- | --- |
| color-primary | #2563EB |

### Numbers

| token | value | applies to |
| --- | --- | --- |
| rounded-md | 12px | corner radius |

### Typography

| token | size | weight | line-height |
| --- | --- | --- | --- |
| highlight-small | 12px | 700 | 1.3 |
| body-primary | 16px | 400 | 1.5 |
| label-caps | 11px | 600 | 1.2 |
| legal-fine | 10px | 400 | 1.4 |

#### highlight-small

```yaml
kerning: 0.02em
underline: true
strikethrough: true
text-transform: uppercase
text-align: center
```

#### body-primary

```yaml
measure: 68ch
font-family: "Inter", system-ui, sans-serif
font-feature-settings: "ss01" 1, "cv02" 2
text-rendering: optimizeLegibility
```

#### label-caps

```yaml
small-caps: true
```

#### label-caps

```yaml
font-variant: small-caps
```

#### body-principal

```yaml
measure: 68ch
```

## Components

### Button/Primary

```yaml
name: Button/Primary
archetype: button
properties:
  background: color-primary
  radius: rounded-md
  font: highlight-small
```

## Backlog

_Nothing outstanding._
