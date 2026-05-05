'use client';

import { 
  Center, 
  Box, 
  Stack, 
  Title, 
  Text, 
  Button, 
  Container,
  rem,
  Anchor,
  Group
} from "@mantine/core";
import Link from "next/link";
import { PageShell } from "@/components/ui/app-shell";

// High-integrity Google Icon wrapper
const GoogleIcon = () => (
  <Box component="svg" w={20} h={20} viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.47-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.96 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.96 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </Box>
);

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = "/api/auth/login?returnTo=/";
  };

  return (
    <PageShell width="xl">
      <Center style={{ minHeight: 'calc(100vh - 200px)' }}>
        <Container size="xs" w="100%">
          <Stack gap="xl">
            <Box ta="center">
              <Title order={1} size={rem(64)} fw={900} lts={-4} mb="xs">
                checklist
              </Title>
              <Text c="dimmed" fw={800} tt="uppercase" lts={3} size="xs" opacity={0.6}>
                Autonomous Intelligence OS
              </Text>
            </Box>

            <Box 
              p={rem(40)} 
              style={{ 
                borderRadius: 'var(--mantine-radius-lg)',
                border: '1px solid var(--mantine-color-default-border)',
                backgroundColor: 'var(--mantine-color-default-hover)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <Box 
                style={{ 
                  position: 'absolute', 
                  top: -20, 
                  right: -20, 
                  width: 100, 
                  height: 100, 
                  borderRadius: '50%', 
                  background: 'var(--mantine-color-brand-filled)', 
                  opacity: 0.05, 
                  filter: 'blur(40px)' 
                }} 
              />
              
              <Stack gap="xl">
                <Stack gap="xs">
                  <Title order={2} size="h3" fw={900} ta="center">Secure Access Protocol</Title>
                  <Text size="sm" c="dimmed" ta="center" fw={500}>
                    Enter the operational theater via verified Google identity.
                  </Text>
                </Stack>

                <Button
                  size="lg"
                  radius="md"
                  fullWidth
                  onClick={handleLogin}
                  variant="default"
                  leftSection={<GoogleIcon />}
                  h={rem(60)}
                  fw={800}
                  style={{ 
                    border: '1px solid var(--mantine-color-default-border)',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.05)'
                  }}
                >
                  Continue with Google
                </Button>

                <Stack gap={8} align="center">
                  <Text size="10px" c="dimmed" fw={800} tt="uppercase" lts={1} opacity={0.5}>
                    Compliance & Security Acknowledgement
                  </Text>
                  <Group gap="xs">
                    <Anchor component={Link} href="/privacy" size="xs" fw={800} c="brand" tt="uppercase" lts={1}>Privacy</Anchor>
                    <Text c="dimmed" size="xs" opacity={0.3}>•</Text>
                    <Anchor component={Link} href="/terms" size="xs" fw={800} c="brand" tt="uppercase" lts={1}>Terms</Anchor>
                  </Group>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </Container>
      </Center>
    </PageShell>
  );
}
