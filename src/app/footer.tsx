'use client';

import Link from "next/link";

const VERSION = "0.1.0";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/80 bg-background/80 py-5 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 text-sm text-muted-foreground md:px-6">
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </div>
        <div className="rounded-full border border-border/80 bg-card px-3 py-1 text-xs shadow-card">
          v{VERSION}
        </div>
      </div>
    </footer>
  );
}
