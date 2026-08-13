/* The survivor of the clone pair: the same pattern, written more often. */
export function Card({ title, children }) {
  return (
    <div className="card card--elevated card--padded">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function CardList({ items }) {
  return (
    <div className="card card--elevated card--padded">
      {items.map((item) => (
        <span key={item} className="label">{item}</span>
      ))}
    </div>
  );
}
