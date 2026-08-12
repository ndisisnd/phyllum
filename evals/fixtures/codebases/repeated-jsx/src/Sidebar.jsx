export function Sidebar({ status, tips }) {
  return (
    <aside className="sidebar">
      <span className="chip chip--info">{status}</span>

      <div className="card card--flat">
        <h3>Tips</h3>
        <ul>
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>

      <div className="card card--flat">
        <h3>Shortcuts</h3>
      </div>

      {/* Used exactly once: one sighting is not a pattern, so this must not be
          proposed as a candidate. */}
      <button className="btn btn--ghost">Hide</button>
    </aside>
  );
}
