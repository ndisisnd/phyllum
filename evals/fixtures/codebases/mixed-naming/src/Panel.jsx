// `panel-header` and `panelHeader` are the casing half of the drift reading:
// the same two words in the same order, spelled two ways.
//
// The `Panel` usages are the type-conflict half of the prop reading: `size` is
// a word in one place and a number in the next, so the prop cannot mean one
// thing. `title={heading}` is the honesty case — an expression Phyllum can see
// and cannot read, which must be counted and never called a conflict.

export function Panel({ heading, children }) {
  return (
    <section className="panel-header">
      <Panel size="lg" title={heading}>
        {children}
      </Panel>

      <Panel size={3} title="Details">
        {children}
      </Panel>

      <div className="panelHeader">the same two words, spelled the other way</div>
      <div className="panel-footer">
        <Card size="sm">a prop given one shape twice is not a conflict</Card>
        <Card size="lg">and neither is this one</Card>
      </div>
    </section>
  );
}
