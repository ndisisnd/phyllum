/**
 * The same values again, spelled the two other ways Phyllum reads: an inline
 * style object, and Tailwind arbitrary values.
 */
export function Button({ children }) {
  return (
    <button className="rounded-[12px] bg-[#2563EB] text-[12px]" style={{ padding: '8px 16px' }}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children }) {
  return (
    <button className="rounded-[11px] bg-[#2564EC]" style={{ color: '#FFFFFF' }}>
      {children}
    </button>
  );
}
