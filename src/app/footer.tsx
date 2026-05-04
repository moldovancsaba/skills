'use client';

import { Box, Container, Group, Anchor, Text, rem } from "@mantine/core";
import { APP_VERSION } from "@/lib/release";
import Link from "next/link";

export function Footer() {
  return (
    <Box 
      component="footer" 
      mt="auto" 
      py="md" 
      style={{ 
        borderTop: '1px solid var(--mantine-color-dark-4)',
        backgroundColor: 'rgba(0,0,0,0.2)',
        backdropFilter: 'blur(10px)'
      }}
    >
      <Container size="7xl">
        <Group justify="space-between">
          <Group gap="xl">
            <Link href="/privacy" style={{ textDecoration: 'none' }}>
              <Text size="xs" c="dimmed" fw={600}>Privacy Policy</Text>
            </Link>
            <Link href="/terms" style={{ textDecoration: 'none' }}>
              <Text size="xs" c="dimmed" fw={600}>Terms of Service</Text>
            </Link>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" lts={1}>
              Release
            </Text>
            <Box 
              px="xs" 
              py={2} 
              style={{ 
                borderRadius: rem(10), 
                backgroundColor: 'var(--mantine-color-dark-6)',
                border: '1px solid var(--mantine-color-dark-4)'
              }}
            >
              <Text size="10px" fw={900} ff="monospace">
                v{APP_VERSION}
              </Text>
            </Box>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}
