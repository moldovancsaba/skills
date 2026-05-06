'use client';

import Link from "next/link";
import { Container, Title, Text, Anchor, Stack, rem } from "@mantine/core";

export default function ContentPage() {
  return (
    <Container size="sm" py={rem(100)}>
      <Stack align="center" ta="center" gap="md">
        <Title order={1} >Legacy View Removed</Title>
        <Text size="sm" c="dimmed" maw={500}>
          Digital presence and content performance intelligence are now handled through the unified Data Ingress pipeline. Use #content or #social tags to feed the intelligence engine.
        </Text>
        <Anchor component={Link} href="/data" size="sm" >
          Open Data Layer →
        </Anchor>
      </Stack>
    </Container>
  );
}