export default function Header() {
  return (
    <header className="border-b-4 border-[var(--ink-black)] bg-[var(--shirt-blank)] py-6">
      {/* Wraps rather than overflows: padding steps down on mobile.
          The wordmark sits at --text-wordmark, not --text-display. It used to
          share the headline's step, so the logo and the page's one <h1> were
          the same size and the eye had nothing to enter on. A wordmark is
          persistent chrome; the headline is the thing that changes. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-8">
        {/* The wordmark links home. A customer can land here cold from an ad
            or a link and had no way to check who Gorilla Salem is without
            reading to the footer — on a tool that asks for a card number
            downstream, that is a trust problem, not a navigation one. */}
        {/* A <p>, not an <h1>. The hero headline is the page's one top-level
            heading; a second <h1> wrapping the wordmark leaves the document
            with no single outline root, which is both an a11y defect and an
            SEO one on a page whose job is local custom-print search. Every
            class is unchanged — this is a tag swap, not a restyle. */}
        <p className="text-wordmark font-bold tracking-display">
          <a
            href="https://gorillasalem.com"
            className="transition-colors duration-[120ms] ease-linear hover:text-[var(--gorilla-green)]"
          >
            <span>GORILLA</span>
            <span className="text-[var(--rush-red)]">LABS</span>
          </a>
        </p>

        <div className="spec border border-[var(--rule)] bg-[var(--paper)] px-5 py-2 text-spec font-bold text-[var(--ink-muted)]">
          Quote Builder
        </div>
      </div>
    </header>
  );
}