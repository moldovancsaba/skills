'use client';

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
  Center, 
  Box, 
  Stack, 
  Title, 
  Text, 
  Button, 
  Alert, 
  Loader,
  Container,
  rem,
  Anchor,
  ThemeIcon,
  Group
} from "@mantine/core";

// High-integrity Google Icon wrapper
const GoogleIcon = () => (
  <Box component="svg" w={20} h={20} viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.47-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.96 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.96 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </Box>
);

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get("authError");
  const [loading, setLoading] = useState(!authError);

  useEffect(() => {
    if (authError) return;

    fetch("/api/auth/session")
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          router.push("/");
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [authError, router]);

  const handleLogin = () => {
    const returnTo = encodeURIComponent("/");
    window.location.href = `/api/auth/login?returnTo=${returnTo}`;
  };

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="xl" variant="bars" color="brand" />
      </Center>
    );
  }

  return (
    <Center h="100vh" bg="body">
      <Container size="xs" w="100%">
        <Stack gap="xl">
          <Box ta="center">
            <Title order={1} size={rem(54)} fw={900} lts={-3} mb="xs">
              checklist
            </Title>
            <Text c="dimmed" fw={700} tt="uppercase" lts={2} size="xs">
              Strategic Intelligence Portal
            </Text>
          </Box>

          {authError && (
            <Alert color="red" variant="light" radius="md" title="Access Denied">
              {authError === "sso_not_configured" 
                ? "SSO protocol mismatch. Contact systems administrator."
                : `Security anomaly detected: ${authError}`}
            </Alert>
          )}

          <Button
            size="lg"
            radius="md"
            fullWidth
            onClick={handleLogin}
            variant="default"
            leftSection={<GoogleIcon />}
            h={rem(54)}
            fw={700}
            style={{ 
              border: '1px solid var(--mantine-color-default-border)',
            }}
          >
            Authenticate with Google
          </Button>

          <Stack gap={8} align="center">
            <Text size="10px" c="dimmed" fw={800} tt="uppercase" lts={1}>
              Security Protocol Acknowledgement Required
            </Text>
            <Group gap="xs">
              <Anchor component={Link} href="/privacy" size="xs" fw={800} c="brand" tt="uppercase" lts={1}>Privacy</Anchor>
              <Text c="dimmed" size="xs" opacity={0.5}>•</Text>
              <Anchor component={Link} href="/terms" size="xs" fw={800} c="brand" tt="uppercase" lts={1}>Terms</Anchor>
            </Group>
          </Stack>
        </Stack>
      </Container>
    </Center>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <Center h="100vh">
        <Loader size="xl" variant="bars" color="brand" />
      </Center>
    }>
      <AuthContent />
    </Suspense>
  );
}
