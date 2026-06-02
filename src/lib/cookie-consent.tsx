'use client';

import { useState } from "react";
import { IconCheck as Check } from "@tabler/icons-react";
import { Text } from "@/components/ui/typography";

type ConsentSettings = {
  essential: boolean;
  analytics: boolean;
  personalization: boolean;
};

const DEFAULT_CONSENT: ConsentSettings = {
  essential: true, analytics: false, personalization: false, };

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

import { Affix, Group, Button, Checkbox, Stack, Box, rem, Container } from "@mantine/core";
import { UnifiedCard, UnifiedCardBody } from "@/components/ui/unified-card";

export function CookieBanner() {
  const [analytics, setAnalytics] = useState(false);
  const [personalization, setPersonalization] = useState(false);
  const { showBanner, acceptAll, acceptSelected, close } = useCookieConsent();

  if (!showBanner) return null;

  return (
    <Affix position={{ bottom: 0, left: 0, right: 0 }} zIndex={1000}>
      <Container fluid px="md" pl="var(--app-shell-navbar-offset, 280px)">
        <Box py="md">
          <Box maw={1200} mx="auto">
            <UnifiedCard tone="neutral">
              <UnifiedCardBody>
                <Stack gap="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} flex={1}>
                  <Text size="sm" fw={700}>Cookie Preferences</Text>
                  <Text size="xs" c="dimmed">
                    We use cookies to improve your experience. Essential cookies are required for the system to operate.
                  </Text>
                  <Group gap="xl" mt="xs">
                    <Checkbox label="Essential" checked disabled size="xs" color="ingress" />
                    <Checkbox 
                      label="Analytics" 
                      checked={analytics} 
                      onChange={(e) => setAnalytics(e.currentTarget.checked)} 
                      size="xs" 
                      color="ingress"
                    />
                    <Checkbox 
                      label="Personalization" 
                      checked={personalization} 
                      onChange={(e) => setPersonalization(e.currentTarget.checked)} 
                      size="xs" 
                      color="ingress"
                    />
                  </Group>
                </Stack>
                <Group gap="xs" wrap="nowrap">
                  <Button 
                    variant="light" 
                    color="gray" 
                    size="xs" 
                    onClick={() => acceptSelected({ essential: true, analytics, personalization })}
                  >
                    Save Preferences
                  </Button>
                  <Button 
                    variant="filled" 
                    color="ingress" 
                    size="xs" 
                    onClick={acceptAll}
                  >
                    Accept All
                  </Button>
                </Group>
              </Group>
                </Stack>
              </UnifiedCardBody>
            </UnifiedCard>
          </Box>
        </Box>
      </Container>
    </Affix>
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
