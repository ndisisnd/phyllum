# Design System

> Phyllum manages this file. It is the single source of truth for this project's design system.

- Project: acme-web
- Phyllum version: 0.1.0
- Created: 2026-08-12

Hand-written note from the team: our blues are deliberately two different
values until the marketing site is retired. Do not "fix" this.

## Tokens

### Colours

| token | value |
| --- | --- |
| color-primary | #2563EB |

### Numbers

| token | value | applies to |
| --- | --- | --- |
| rounded-md | 12px | corner radius |

## Components

### Button/Primary

```yaml
name: Button/Primary
archetype: button
properties:
  background: color-primary
  radius: rounded-md
```

## Notes for reviewers

This section is not part of the Phyllum template. It must survive a rerun of
`phyllum init` untouched.
