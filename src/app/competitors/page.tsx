'use client';

import Link from "next/link";
import { Container, Title, Text, Anchor, Stack, rem } from "@mantine/core";

export default function CompetitorsPage() {
  return (
    <Container size="sm" py={rem(100)}>
      <Stack align="center" ta="center" gap="md">
        <Title order={1} >Legacy View Removed</Title>
        <Text size="sm" c="dimmed" maw={500}>
          The system no longer treats competitors as a hardcoded source class. Use the unified Data page to add raw sources and let AI clustering organize them.
        </Text>
        <Anchor component={Link} href="/data" size="sm" >
          Open Data Layer →
        </Anchor>
      </Stack>
    </Container>
  );
}
