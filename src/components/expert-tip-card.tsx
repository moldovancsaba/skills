import Link from "next/link";
import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";
import { Badge, Button, Group, Stack, Text, Box, ThemeIcon, Alert } from "@mantine/core";

import type { ExpertTip } from "@/content/help";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardActions 
} from "@/components/ui/unified-card";

type ExpertTipCardProps = {
  tip: ExpertTip;
};

export function ExpertTipCard({ tip }: ExpertTipCardProps) {
  return (
    <UnifiedCard className="h-full">
      <UnifiedCardHeader
        supporting={
          <Group gap="xs">
            <ThemeIcon variant="light" color="brand" size="lg" radius="md">
              <Lightbulb size={18} />
            </ThemeIcon>
            <Badge variant="outline" color="brand" size="sm" tt="uppercase" fw={800}>
              {tip.category}
            </Badge>
          </Group>
        }
        title={tip.title}
        description={tip.body}
      />
      
      <UnifiedCardBody>
        <Alert 
          icon={<Sparkles size={16} />} 
          title="Strategic Rationale" 
          color="brand" 
          variant="light"
          radius="md"
          styles={{
            title: { fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }
          }}
        >
          <Text size="sm" style={{ lineHeight: 1.5 }}>
            {tip.whyItMatters}
          </Text>
        </Alert>

        {tip.samplePhrases && tip.samplePhrases.length > 0 && (
          <Stack gap="xs">
            <Text size="xs" fw={800} tt="uppercase" lts={1} c="dimmed">Suggested Phrasing</Text>
            <Stack gap={6}>
              {tip.samplePhrases.map((phrase) => (
                <Box 
                  key={phrase} 
                  p="xs" 
                  style={{ 
                    borderRadius: "var(--mantine-radius-sm)",
                    backgroundColor: "rgba(0,0,0,0.15)",
                    border: "1px solid rgba(255,255,255,0.05)"
                  }}
                >
                  <Text size="xs" fs="italic" c="dimmed">“{phrase}”</Text>
                </Box>
              ))}
            </Stack>
          </Stack>
        )}
      </UnifiedCardBody>

      <UnifiedCardActions>
        <Button 
          component={Link} 
          href={tip.ctaHref} 
          color="brand" 
          size="sm" 
          rightSection={<ArrowRight size={14} />}
        >
          {tip.ctaLabel}
        </Button>
        <Button 
          component={Link} 
          href="/faq" 
          variant="subtle" 
          color="gray" 
          size="sm"
        >
          FAQ
        </Button>
      </UnifiedCardActions>
    </UnifiedCard>
  );
}
