'use client';

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/app-shell";

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = "/api/auth/login?returnTo=/";
  };

  return (
    <PageShell width="5xl" className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-10">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 shadow-elevated"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-sky-500/15 via-orange-400/10 to-violet-500/15" />
        <div className="relative flex w-full items-center justify-center px-4 py-6 md:px-6 md:py-8">
          <div className="w-full max-w-3xl rounded-[1.75rem] border border-white/20 bg-slate-950/60 px-6 py-6 text-center text-white shadow-2xl backdrop-blur-md md:px-8">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/30">
              <Image
                src="/images/hero.png"
                alt="Checklist hero"
                fill
                className="object-contain"
                priority
              />
            </div>

            <div className="mx-auto mt-6 max-w-2xl">
              <Button
                onClick={handleLogin}
                className="mt-8 h-14 w-full text-lg font-semibold shadow-lg shadow-violet-950/30 transition-all duration-300 hover:shadow-violet-900/40"
                size="lg"
              >
                <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continue with Google
              </Button>

              <p className="mt-6 text-xs text-slate-300/80">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          </div>
        </div>
      </motion.section>
    </PageShell>
  );
}
