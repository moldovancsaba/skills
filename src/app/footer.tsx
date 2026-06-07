'use client';

import { Box, Container, Group, Anchor, rem } from "@/components/gds/primitives";
import { APP_VERSION } from "@/lib/release";
import Link from "next/link";
import { getSemanticFooterStyle, getSemanticPillStyle } from "@/lib/semantic-theme";
import { MetaText } from "@/components/ui/typography";

export function Footer() {
  return (
    <Box 
      component="footer" 
      mt="auto" 
      py="md" 
      style={getSemanticFooterStyle("neutral")}
    >
      <Container size="7xl">
        <Group justify="space-between">
          <Group gap="xl">
            <Anchor component={Link} href="/privacy" size="xs" c="dimmed">
              Privacy Policy
            </Anchor>
            <Anchor component={Link} href="/terms" size="xs" c="dimmed">
              Terms of Service
            </Anchor>
          </Group>
          <Group gap="xs">
            <MetaText c="dimmed">
              Release
            </MetaText>
            <Box 
              px="xs" 
              py={2} 
              style={getSemanticPillStyle("neutral", { radius: rem(6) })}
            >
              <MetaText c="var(--text-primary)">v{APP_VERSION}</MetaText>
            </Box>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}
