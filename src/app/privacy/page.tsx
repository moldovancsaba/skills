import { Metadata } from "next";
import { Container, Title, Text, Stack, Box, Divider, Group, ThemeIcon, rem } from "@mantine/core";
import { IconShield as Shield, IconDatabase as Database, IconLock as Lock, IconEye as Eye, IconMail as Mail } from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "Privacy Policy - checklist OS",
};

export default function PrivacyPage() {
  return (
    <Container size="sm" py={rem(80)}>
      <Stack gap={60}>
        <Box>
          <Group gap="sm" mb="xs">
            <ThemeIcon color="indigo">
              <Shield size={20} />
            </ThemeIcon>
            <Title order={1}>Privacy Policy</Title>
          </Group>
          <Text size="xs" c="dimmed" ml={rem(44)}>
            PROTOCOL v0.15.2 • LAST SYNC: MAY 2025
          </Text>
        </Box>

        <Stack gap={40}>
          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <Database size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" mb={4}>Data Collection</Title>
              <Text size="sm" c="dimmed">
                We harvest company information, product details, customer data, and competitor 
                intelligence that you voluntarily provision. We also collect usage data to calibrate 
                the autonomous intelligence layer.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <Lock size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" mb={4}>Processing Architecture</Title>
              <Text size="sm" c="dimmed">
                Your data is used to synthesize marketing recommendations (Strategic Actions) 
                tailored to your business. All primary AI processing is performed using 
                high-integrity local inference - no data is leaked to external public AI services.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <Database size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" mb={4}>Data Storage</Title>
              <Text size="sm" c="dimmed">
                Intelligence is stored in secure MongoDB Atlas clusters. Local synchronization 
                runs on hardened infrastructure for AI processing. We implement industrial-grade security measures to protect the memory engine.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <Eye size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" mb={4}>Your Rights</Title>
              <Text size="sm" c="dimmed">
                You may request complete purging of your data at any time. Contact us to exercise 
                your data subject access requests through the sovereign intelligence gateway.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <Mail size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" mb={4}>Contact</Title>
              <Text size="sm" c="dimmed">
                For privacy questions, contact the system administrators through the app dashboard.
              </Text>
            </Box>
          </Group>
        </Stack>
      </Stack>
    </Container>
  );
}