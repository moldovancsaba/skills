'use client';

import { useState, useEffect } from "react";
import { IconGitBranch as GitBranch, IconFileText as FileText, IconBulb as Lightbulb, IconSquareCheck as CheckSquare, IconX as X } from "@tabler/icons-react";
import { 
  Box, Stack, Group, ActionIcon, ThemeIcon, Loader, Center, rem, ScrollArea } from "@mantine/core";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import {
  getSemanticHaloStyle,
  getSemanticDividerStyle,
  getSemanticInsetStyle,
  getSemanticOverlayShadowStyle,
  getSemanticSurfaceStyle,
} from "@/lib/semantic-theme";

interface TraceNode {
  id: string;
  type: 'SOURCE' | 'FLASHCARD' | 'TASK';
  title: string;
  timestamp: string;
}

/**
 * Visualizes the provenance chain of an intelligence unit.
 */
export function TraceViewer({ 
  versionFamilyId, 
  onClose 
}: { 
  versionFamilyId: string; 
  onClose: () => void 
}) {
  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrace() {
      setLoading(true);
      try {
        const res = await fetch(`/api/trace?familyId=${versionFamilyId}`);
        const data = await res.json();
        setNodes(data);
      } catch (e) {
        console.error("Trace fetch failed", e);
      } finally {
        setLoading(false);
      }
    }

    if (versionFamilyId) fetchTrace();
  }, [versionFamilyId]);

  return (
    <Box
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        right: 0,
        width: rem(400),
        ...getSemanticSurfaceStyle("neutral", { elevated: true }),
        ...getSemanticOverlayShadowStyle("neutral"),
        borderLeft: '1px solid var(--border-primary)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
      p="xl"
    >
      <Stack gap="xl" h="100%">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ThemeIcon variant="light" color="synthesis"  size="lg">
              <GitBranch size={20} />
            </ThemeIcon>
            <SectionTitle>Intelligence Lineage</SectionTitle>
          </Group>
          <ActionIcon variant="subtle" color="gray" onClick={onClose}>
            <X size={20} />
          </ActionIcon>
        </Group>

        <Box style={{ flex: 1, position: 'relative' }}>
          {/* Vertical connecting line */}
          <Box 
            style={{ 
              position: 'absolute', 
              left: 17, 
              top: 20, 
              bottom: 20, 
              ...getSemanticDividerStyle("neutral", { width: 2, opacity: 0.5 }),
            }} 
          />

          <ScrollArea h="100%" offsetScrollbars>
            <Stack gap={40} py="md">
              {loading ? (
                <Center h={200}>
                  <Loader variant="bars" color="ingress" size="lg" />
                </Center>
              ) : nodes.map((node) => (
                <Group key={node.id} wrap="nowrap" align="flex-start" gap="lg" style={{ position: 'relative', zIndex: 1 }}>
                  <ThemeIcon 
                    variant="filled" 
                    color={node.type === 'SOURCE' ? 'gray' : node.type === 'FLASHCARD' ? 'knowmore' : 'checklist'} 
                    size={36}
                    style={getSemanticHaloStyle("neutral")}
                  >
                    {node.type === 'SOURCE' && <FileText size={18} />}
                    {node.type === 'FLASHCARD' && <Lightbulb size={18} />}
                    {node.type === 'TASK' && <CheckSquare size={18} />}
                  </ThemeIcon>
                  
                  <Stack gap={2}>
                    <MetaText>{node.type} • {new Date(node.timestamp).toLocaleTimeString()}</MetaText>
                    <BodyText c="var(--text-primary)">{node.title}</BodyText>
                  </Stack>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Box>

        <Box 
          p="md" 
          style={{ 
            borderRadius: 'var(--mantine-radius-md)',
            ...getSemanticInsetStyle("neutral"),
          }}
        >
          <Text size="xs" c="dimmed" lh={1.6} fs="italic">
            This trace visualizes the autonomous transformation from raw market evidence into strategic action cards.
          </Text>
        </Box>
      </Stack>
    </Box>
  );
}
