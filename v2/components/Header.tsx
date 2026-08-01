export default function Header() {
  return (
    <header className="border-b-4 border-[var(--ink-black)] bg-[var(--shirt-blank)] py-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8">
        <h1 className="text-4xl font-black tracking-tight">
          <span>GORILLA</span>
          <span className="text-[var(--rush-red)]">LABS</span>
        </h1>

        <div className="spec border border-[var(--rule)] bg-[var(--paper)] px-5 py-2 text-sm font-bold text-[var(--ink-muted)]">
          Quote &amp; Order Builder
        </div>
      </div>
    </header>
  );
}