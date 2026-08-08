export default function Header() {
  return (
    <header className="border-b-4 border-[var(--ink-black)] bg-[var(--shirt-blank)] py-6">
      {/* Wraps rather than overflows: the wordmark grew to text-display, and
          at 375px it no longer shares a line with the badge. Padding steps
          down on mobile for the same reason. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-8">
        {/* The wordmark links home. A customer can land here cold from an ad
            or a link and had no way to check who Gorilla Salem is without
            reading to the footer — on a tool that asks for a card number
            downstream, that is a trust problem, not a navigation one. */}
        <h1 className="text-display font-bold tracking-display">
          <a
            href="https://gorillasalem.com"
            className="transition-colors duration-[120ms] ease-linear hover:text-[var(--gorilla-green)]"
          >
            <span>GORILLA</span>
            <span className="text-[var(--rush-red)]">LABS</span>
          </a>
        </h1>

        <div className="spec border border-[var(--rule)] bg-[var(--paper)] px-5 py-2 text-spec font-bold text-[var(--ink-muted)]">
          Quote &amp; Order Builder
        </div>
      </div>
    </header>
  );
}