'use client';

import Link from "next/link";

export default function CompetitorsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Legacy View Removed</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        The system no longer treats competitors as a hardcoded source class. Use the unified Data page to add raw sources and let AI clustering organize them.
      </p>
      <Link href="/data" className="mt-6 inline-block text-sm font-medium underline">
        Open Data
      </Link>
    </main>
  );
}

