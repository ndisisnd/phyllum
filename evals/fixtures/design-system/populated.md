# Design System

> Phyllum manages this file. It is the single source of truth for this project's design system.

- Project: acme-web
- Phyllum version: 0.1.0
- Created: 2026-08-12

## Tokens

### Colours

| token | value |
| --- | --- |
| color-primary | #2563EB |
| color-surface | #FFFFFF |

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
  padding-top: 12px # TODO: tokenise
  padding-bottom: 8px # TODO: tokenise
states:
  disabled: TODO
```

````jsx
/**
 * Usage:
 *
 * ```jsx
 * <ButtonPrimary>Save</ButtonPrimary>
 * ```
 */
export function ButtonPrimary({ children }) {
  return <button className="button-primary">{children}</button>;
}
````

### Card/Basic

```yaml
name: Card/Basic
archetype: card
properties:
  background: color-surface
  radius: rounded-md
```

## Backlog

- TODO: tokenise `12px` (Button/Primary padding-top)
- TODO: tokenise `8px` (Button/Primary padding-bottom)
- TODO: fill contract slot `disabled` (Button/Primary)
