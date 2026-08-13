# Design System

> Phyllum manages this file. It is the single source of truth for this project's design system.

- Project: apply-target
- Phyllum version: 0.1.0
- Created: 2026-08-13

## Tokens

### Colours

| token | value | notes |
| --- | --- | --- |
| color-primary | #2563EB | main brand blue |
| color-surface | #FFFFFF | page background |

### Numbers

| token | value | applies to |
| --- | --- | --- |
| rounded-md | 12px | corner radius |

### Typography

| token | size | weight | line-height |
| --- | --- | --- | --- |
| highlight-small | 12px | 700 | 1.3 |

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

### Card/Basic

```yaml
name: Card/Basic
archetype: card
properties:
  background: color-surface
  radius: rounded-md
  padding: TODO
```

## Backlog

- TODO: fill contract slot `padding` (Card/Basic)
