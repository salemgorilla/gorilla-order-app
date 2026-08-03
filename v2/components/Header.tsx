export default function Header() {
  return (
    <header className="border-b-4 border-[var(--ink-black)] bg-[var(--shirt-blank)] py-6">
      {/* Wraps rather than overflows: the wordmark grew to text-display, and
          at 375px it no longer shares a line with the badge. Padding steps
          down on mobile for the same reason. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-8">
        <h1 className="text-display font-bold tracking-display">
          <span>GORILLA</span>
          <span className="text-[var(--rush-red)]">LABS</span>
        </h1>

        <div className="spec border border-[var(--rule)] bg-[var(--paper)] px-5 py-2 text-spec font-bold text-[var(--ink-muted)]">
          Quote &amp; Order Builder
        </div>
      </div>
    </header>
  );
}