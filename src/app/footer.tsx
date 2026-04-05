'use client';

import Link from "next/link";

const VERSION = "0.1.0";

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto py-4">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </div>
        <div>
          v{VERSION}
        </div>
      </div>
    </footer>
  );
}