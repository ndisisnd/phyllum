// The kebab majority. Without enough names carrying one convention there is no
// dominant convention to stray from, and Phyllum would report that it could not
// find one rather than electing a winner by a single vote.
//
// `btn--ghost` is the control for the other half of the vote: a BEM modifier is
// evidence for kebab, not against it, so this line must not be reported as a
// stray in a codebase whose other names are hyphenated too.

export function Legacy({ note }) {
  return (
    <aside className="legacy-panel">
      <p className="legacy-note">{note}</p>
      <span className="btn--ghost">a modifier, spelled the way this codebase spells modifiers</span>
    </aside>
  );
}
