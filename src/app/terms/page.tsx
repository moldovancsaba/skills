import { Metadata } from "next";
import { Container, Title, Text, Stack, Box, Divider, Group, ThemeIcon, rem } from "@mantine/core";
import { ShieldCheck, FileText, Cpu, Activity, AlertTriangle, RefreshCw } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service - checklist OS",
};

export default function TermsPage() {
  return (
    <Container size="sm" py={rem(80)}>
      <Stack gap={60}>
        <Box>
          <Group gap="sm" mb="xs">
            <ThemeIcon variant="light" color="brand" size="lg" radius="md">
              <ShieldCheck size={20} />
            </ThemeIcon>
            <Title order={1} fw={900} lts={-1}>Terms of Service</Title>
          </Group>
          <Text size="xs" fw={800} tt="uppercase" lts={2} c="dimmed" ml={rem(44)}>
            PROTOCOL v0.15.2 • LAST SYNC: MAY 2025
          </Text>
        </Box>

        <Stack gap={40}>
          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray" size="xl">
              <Activity size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" fw={900} mb={4} tt="uppercase" lts={1}>Acceptable Use</Title>
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }} fw={500}>
                You agree to use checklist only for lawful business purposes. 
                You are responsible for all activity under your account. Access to the intelligence layer requires authorized SSO credentials.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray" size="xl">
              <FileText size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" fw={900} mb={4} tt="uppercase" lts={1}>Data Ownership</Title>
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }} fw={500}>
                You retain ownership of all data you input. By using our service, 
                you grant us permission to process your data to provide AI-generated 
                recommendations and maintain contextual memory.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray" size="xl">
              <Cpu size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" fw={900} mb={4} tt="uppercase" lts={1}>AI Service</Title>
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }} fw={500}>
                Our AI generates marketing recommendations based on your data. 
                Recommendations are suggestions only - you are responsible for evaluating 
                and implementing them. The OS operates as a high-fidelity intelligence assistant, not a fiduciary.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray" size="xl">
              <Activity size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" fw={900} mb={4} tt="uppercase" lts={1}>Service Availability</Title>
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }} fw={500}>
                We strive to keep the service available 24/7 but do not guarantee 
                uptime. The autonomous background worker runs periodically to ensure memory synchronization.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="red" size="xl">
              <AlertTriangle size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" fw={900} mb={4} tt="uppercase" lts={1} c="red">Disclaimer</Title>
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }} fw={500}>
                checklist provides AI-generated suggestions for marketing purposes only. 
                We do not guarantee the accuracy or effectiveness of any recommendations. Implement at your own strategic risk.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray" size="xl">
              <RefreshCw size={24} />
            </ThemeIcon>
            <Box>
              <Title order={2} size="h4" fw={900} mb={4} tt="uppercase" lts={1}>Changes to Terms</Title>
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }} fw={500}>
                We may update these terms at any time. Continued use constitutes 
                acceptance of updated terms.
              </Text>
            </Box>
          </Group>
        </Stack>
      </Stack>
    </Container>
  );
}