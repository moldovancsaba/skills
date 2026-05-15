import { Metadata } from "next";
import { Container, Title, Text, Stack, Box, Divider, Group, ThemeIcon, rem } from "@mantine/core";
import { IconShieldCheck as ShieldCheck, IconFileText as FileText, IconCpu as Cpu, IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconRefresh as RefreshCw } from "@tabler/icons-react";
import { SectionTitle } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Terms of Service - checklist OS",
};

export default function TermsPage() {
  return (
    <Container size="sm" py={rem(80)}>
      <Stack gap={60}>
        <Box>
          <Group gap="sm" mb="xs">
            <ThemeIcon color="ingress">
              <ShieldCheck size={20} />
            </ThemeIcon>
            <Title order={1}>Terms of Service</Title>
          </Group>
          <Text size="xs" c="dimmed" ml={rem(44)}>
            PROTOCOL v0.16.0 • LAST SYNC: MAY 2026
          </Text>
        </Box>

        <Stack gap={40}>
          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <Activity size={24} />
            </ThemeIcon>
            <Box>
              <SectionTitle>Acceptable Use</SectionTitle>
              <Text size="sm" c="dimmed">
                You agree to use checklist only for lawful business purposes. 
                You are responsible for all activity under your account. Access to the intelligence layer requires authorized SSO credentials.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <FileText size={24} />
            </ThemeIcon>
            <Box>
              <SectionTitle>Data Ownership</SectionTitle>
              <Text size="sm" c="dimmed">
                You retain ownership of all data you input. By using our service, 
                you grant us permission to process your data to provide AI-generated 
                recommendations and maintain contextual memory.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <Cpu size={24} />
            </ThemeIcon>
            <Box>
              <SectionTitle>AI Service</SectionTitle>
              <Text size="sm" c="dimmed">
                Our AI generates marketing recommendations based on your data. 
                Recommendations are suggestions only - you are responsible for evaluating 
                and implementing them. The OS operates as a high-fidelity intelligence assistant, not a fiduciary.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <Activity size={24} />
            </ThemeIcon>
            <Box>
              <SectionTitle>Service Availability</SectionTitle>
              <Text size="sm" c="dimmed">
                We strive to keep the service available 24/7 but do not guarantee 
                uptime. The autonomous background worker runs periodically to ensure memory synchronization.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="review">
              <AlertTriangle size={24} />
            </ThemeIcon>
            <Box>
              <SectionTitle>Disclaimer</SectionTitle>
              <Text size="sm" c="dimmed">
                checklist provides AI-generated suggestions for marketing purposes only. 
                We do not guarantee the accuracy or effectiveness of any recommendations. Implement at your own strategic risk.
              </Text>
            </Box>
          </Group>

          <Divider variant="dashed" />

          <Group wrap="nowrap" align="flex-start" gap="xl">
            <ThemeIcon variant="subtle" color="gray">
              <RefreshCw size={24} />
            </ThemeIcon>
            <Box>
              <SectionTitle>Changes to Terms</SectionTitle>
              <Text size="sm" c="dimmed">
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
