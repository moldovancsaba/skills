'use client';

import { useState } from "react";
import { Check } from "lucide-react";

type ConsentSettings = {
  essential: boolean;
  analytics: boolean;
  personalization: boolean;
};

const DEFAULT_CONSENT: ConsentSettings = {
  essential: true,
  analytics: false,
  personalization: false,
};

const STORAGE_KEY = "cookie_consent_v2";

export function useCookieConsent() {
  const [showBanner, setShowBanner] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem(STORAGE_KEY);
  });
  const [settings, setSettings] = useState<ConsentSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_CONSENT;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_CONSENT;
  });

  const acceptAll = () => {
    const fullConsent = { essential: true, analytics: true, personalization: true };
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
  const [personalization, setPersonalization] = useState(false);
  const { showBanner, acceptAll, acceptSelected, close } = useCookieConsent();

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 shadow-lg z-50">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm">
            We use cookies to improve your experience. Essential cookies are required for the system to operate.
          </p>
          <div className="flex items-center gap-4 mt-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked disabled className="rounded" />
              Essential
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="rounded"
              />
              Analytics
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={personalization}
                onChange={(e) => setPersonalization(e.target.checked)}
                className="rounded"
              />
              Personalization
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={acceptAll}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md font-bold"
          >
            Accept All
          </button>
          <button
            onClick={() => acceptSelected({ essential: true, analytics, personalization })}
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

export function hasPersonalizationConsent(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  return JSON.parse(stored).personalization;
}
