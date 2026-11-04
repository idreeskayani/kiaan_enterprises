// Decorative animated background (blobs + faint plane, ship and truck). Purely visual.
const BOXES = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

function PlaneIcon() {
  return (
    <svg viewBox="0 0 160 50" width="170" height="53" fill="currentColor">
      <path d="M66 22 L52 6 L66 6 L90 20Z" opacity=".6" />
      <path d="M10 19 L0 2 L18 2 L34 16Z" />
      <path d="M4 25 C4 18 18 14 52 14 L120 16 C136 17 152 22 156 25 C152 28 136 33 120 34 L52 36 C18 36 4 32 4 25Z" />
      <path d="M64 27 L40 49 L58 49 L96 29Z" />
    </svg>
  );
}

function ShipIcon() {
  return (
    <svg viewBox="0 0 200 70" width="250" height="88" fill="currentColor">
      <rect x="20" y="22" width="30" height="24" />
      <rect x="26" y="12" width="16" height="10" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={`a${i}`} x={60 + i * 25} y="30" width="23" height="16" fill={BOXES[i % BOXES.length]} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={`b${i}`} x={72 + i * 25} y="13" width="23" height="16" fill={BOXES[(i + 2) % BOXES.length]} />
      ))}
      <path d="M6 46 L194 46 L176 66 L24 66Z" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 160 60" width="170" height="64" fill="currentColor">
      <rect x="0" y="6" width="104" height="36" rx="3" />
      <path d="M108 16 L136 16 L152 32 L152 42 L108 42Z" />
      {[24, 46, 126].map((x) => (
        <circle key={x} cx={x} cy="47" r="9" />
      ))}
    </svg>
  );
}

export default function Backdrop() {
  return (
    <div className="bg-fx" aria-hidden="true">
      <i className="blob b1" />
      <i className="blob b2" />
      <i className="blob b3" />
      <div className="fx fx-plane"><PlaneIcon /></div>
      <div className="fx fx-ship"><ShipIcon /></div>
      <div className="fx fx-truck"><TruckIcon /></div>
    </div>
  );
}
