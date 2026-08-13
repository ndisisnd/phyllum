// A codebase that never agreed on how to spell anything (v0.2.1 plan §5.1).
//
// The class names here are mostly kebab, which is what makes the camel ones
// strays rather than a second house style — and `btn--primary` next to
// `primary-btn` is one concept in two word orders, which is the drift reading.
//
// The `Button` usages are the prop half (§5.2): `onClick` in one place and
// `onPress` in the next is one component being handed two names for one prop.

export function Toolbar({ items, save }) {
  return (
    <div className="toolbar-row">
      <div className="toolbar-actions">
        <Button className="btn--primary" onClick={save}>
          Save
        </Button>

        <Button className="btn--primary" onPress={save}>
          Save again
        </Button>

        <Button className="btn--ghost" style={{ background: '#2563EB' }}>
          Styled from the call site
        </Button>
      </div>

      <span className="primary-btn">a third spelling of the same two words</span>

      <SmallButton>Small</SmallButton>
      <ButtonSmall>Small, the other way round</ButtonSmall>
      <ButtonSmall>Small again</ButtonSmall>

      <Card {...items}>
        <span className="cardBody">the only camel name with no kebab twin</span>
      </Card>
    </div>
  );
}
