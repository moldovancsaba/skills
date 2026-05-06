'use client';

import Link from "next/link";
import { Container, Title, Text, Anchor, Stack, rem } from "@mantine/core";

export default function LeadsPage() {
  return (
    <Container size="sm" py={rem(100)}>
      <Stack align="center" ta="center" gap="md">
        <Title order={1} >Legacy View Removed</Title>
        <Text size="sm" c="dimmed" maw={500}>
          Lead tracking is now integrated into the unified Data Ingress pipeline. Use hashtags like #leads or #conversion to classify evidence and let the intelligence engine synthesize strategic actions.
        </Text>
        <Anchor component={Link} href="/data" size="sm" >
          Open Data Layer →
        </Anchor>
      </Stack>
    </Container>
  );
}