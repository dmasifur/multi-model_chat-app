'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-gray-500">
        The page failed to load. Retrying is usually enough; if it keeps happening, sign out and
        back in.
      </p>
      {/* Only the digest is shown: error.message can carry internal detail, and
          Next strips it server-side in production but not for client errors. */}
      {error.digest && <p className="font-mono text-xs text-gray-400">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="rounded bg-gray-900 px-4 py-2 text-white">
        Try again
      </button>
    </main>
  );
}
