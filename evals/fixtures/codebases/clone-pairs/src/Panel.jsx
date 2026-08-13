/* The clone: one class away from Card, and used less, so Card survives. */
export function Panel({ title, children }) {
  return (
    <div className="card card--elevated card--padded card--wide">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/* The pattern similarity: the same classes on a different tag. */
export function Muted({ children }) {
  return <section className="panel panel--muted">{children}</section>;
}

export function MutedBox({ children }) {
  return <div className="panel panel--muted">{children}</div>;
}

/* Neither alike nor a bundle: nothing here may be reported. */
export function Footer() {
  return <div className="footer">© Acme</div>;
}
