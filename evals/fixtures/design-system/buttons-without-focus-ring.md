# Design System

> Phyllum manages this file. It is the single source of truth for this project's design system.

- Project: no-focus-ring-fixture
- Phyllum version: 0.1.0
- Created: 2026-08-12

## Tokens

### Colours

| token | value |
| --- | --- |
| color-primary | #2563EB |
| color-focus | #93C5FD |

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
  focus-ring: color-focus
```

### Button/Secondary

```yaml
name: Button/Secondary
archetype: button
properties:
  background: color-primary
  radius: rounded-md
  font: highlight-small
```

### Button/Ghost

```yaml
name: Button/Ghost
archetype: button
properties:
  background: color-primary
  radius: rounded-md
  font: highlight-small
```

## Backlog

_Nothing outstanding._
