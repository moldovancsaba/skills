'use client';

import { useState, useEffect } from "react";
import { Check } from "lucide-react";

type ConsentSettings = {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
};

const DEFAULT_CONSENT: ConsentSettings = {
  essential: true,
  analytics: false,
  marketing: false,
};

const STORAGE_KEY = "cookie_consent";

export function useCookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [settings, setSettings] = useState<ConsentSettings>(DEFAULT_CONSENT);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setShowBanner(true);
    } else {
      setSettings(JSON.parse(stored));
    }
  }, []);

  const acceptAll = () => {
    const fullConsent = { essential: true, analytics: true, marketing: true };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullConsent));
    setSettings(fullConsent);
    setShowBanner(false);
  };

  const acceptSelected = (selected: ConsentSettings) => {
    const final = { ...DEFAULT_CONSENT, ...selected };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(final));
    setSettings(final);
    setShowBanner(false);
  };

  const close = () => setShowBanner(false);

  return { showBanner, settings, acceptAll, acceptSelected, close };
}

export function CookieBanner() {
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const { showBanner, acceptAll, acceptSelected, close } = useCookieConsent();

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 shadow-lg z-50">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm">
            We use cookies to improve your experience. Essential cookies are required for the service to work.
          </p>
          <div className="flex items-center gap-4 mt-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked disabled className="rounded" />
              Essential
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="rounded"
              />
              Analytics
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="rounded"
              />
              Marketing
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={acceptAll}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md"
          >
            Accept All
          </button>
          <button
            onClick={() => acceptSelected({ essential: true, analytics, marketing })}
            className="px-4 py-2 border border-border text-sm rounded-md"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}

export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  return JSON.parse(stored).analytics;
}

export function hasMarketingConsent(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  return JSON.parse(stored).marketing;
}