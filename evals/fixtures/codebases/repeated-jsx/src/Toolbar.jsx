// A fixture codebase for `create` pick mode (plan §3.1 Mode C, §8.5).
//
// The chip is the point: the same span/class pattern appears four times across
// this file and Sidebar.jsx, and nothing in DESIGN-SYSTEM.md knows about it —
// so it should turn up in the candidate list. The buttons are the control:
// `button-primary` is exactly what Phyllum would call `Button/Primary`, which is
// already registered, so it must not be proposed again.

export function Toolbar({ items, onSave }) {
  return (
    <div className="toolbar">
      <span className="chip chip--info">Draft</span>
      <span className="chip chip--info">{items.length} items</span>
      <span className="chip chip--info">Autosaved</span>

      <button className="button-primary" onClick={onSave}>
        Save
      </button>
    </div>
  );
}

export function ToolbarFooter({ note }) {
  return (
    <div className="card card--flat">
      <p>{note}</p>
      <button className="button-primary">Dismiss</button>
    </div>
  );
}
