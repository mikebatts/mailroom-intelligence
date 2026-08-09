export default function Header() {
  return (
    <header className="border-b border-dark/10 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
            M
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Mailroom Intelligence</h1>
            <p className="text-xs text-secondary">
              Scan → extract → route → review. A working demo of AI mail triage.
            </p>
          </div>
        </div>
        <a
          href="https://mikebatts.net"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          mikebatts.net
        </a>
      </div>
    </header>
  );
}
