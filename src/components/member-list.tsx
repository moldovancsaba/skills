'use client';

import { Stack, Group, Avatar, ActionIcon, Tooltip, Badge, Box, ThemeIcon, Loader, rem } from "@mantine/core";
import { 
  UnifiedCard, UnifiedCardHeader, UnifiedCardBody, UnifiedCardSection, } from "@/components/ui/unified-card";
import { BodyText, LabelText, MetaText, Text } from "@/components/ui/typography";
import { FormInput } from "@/components/ui/form-fields";
import { Button } from "@mantine/core";
import { IconUsers as Users, IconUserPlus as UserPlus, IconTrash as Trash2, IconShield as Shield, IconUser as UserIcon, IconMail as Mail } from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { resolveMantineColor } from "@/lib/semantic-theme";

export function MemberList({ companyId, isOwner }: { companyId: string; isOwner: boolean }) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (err) {
      console.error("Failed to fetch members", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void (async () => {
      await fetchMembers();
    })();
  }, [fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setInviting(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role: "MEMBER" }),
      });

      if (res.ok) {
        setEmail("");
        fetchMembers();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add member");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this member?")) return;

    try {
      const res = await fetch(`/api/companies/${companyId}/members?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchMembers();
      }
    } catch (err) {
      console.error("Failed to remove member", err);
    }
  };

  if (loading) {
    return (
      <UnifiedCard tone="ingress" fullHeight>
        <Stack align="center" justify="center" h={200}>
          <Loader color="ingress" />
          <MetaText>Syncing Permissions...</MetaText>
        </Stack>
      </UnifiedCard>
    );
  }

  return (
    <UnifiedCard tone="ingress" fullHeight>
      <UnifiedCardHeader
        supporting={
          <Group gap="xs">
            <ThemeIcon color="ingress">
              <Users size={18} />
            </ThemeIcon>
            <Badge color="ingress">
              Access Control
            </Badge>
          </Group>
        }
        title="Intelligence Team"
        description="Manage secure access to this intelligence unit."
      />

      <UnifiedCardBody>
        <Stack gap="xl">
          {isOwner && (
            <form onSubmit={handleInvite}>
              <Stack gap="xs">
                <Group gap="xs" align="flex-end">
                  <Box style={{ flex: 1 }}>
                    <FormInput
                      placeholder="operator@checklist.os"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      required
                      size="sm"
                    />
                  </Box>
                  <Button 
                    type="submit" 
                    loading={inviting} 
                    color="ingress" 
                    leftSection={<UserPlus size={16} />}
                  >
                    Invite
                  </Button>
                </Group>
                {error && <Text size="xs" c="review">{error}</Text>}
              </Stack>
            </form>
          )}

          <Stack gap="sm">
            {members.map((member) => (
              <UnifiedCardSection
                key={member.id}
                tone={member.role === "OWNER" ? "strategy" : "neutral"}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                    <Avatar color={member.role === 'OWNER' ? 'strategy' : 'ingress'}>
                      {member.email[0].toUpperCase()}
                    </Avatar>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <LabelText truncate>{member.email}</LabelText>
                      <Group gap="xs">
                        <Group gap={4}>
                          <Shield size={12} color={member.role === 'OWNER' ? 'var(--mantine-color-strategy-4)' : 'var(--mantine-color-ingress-4)'} />
                          <MetaText>{member.role === 'OWNER' ? 'Admin' : 'Member'}</MetaText>
                        </Group>
                        <Badge color={member.acceptedAt ? resolveMantineColor("knowmore") : "gray"}>
                          {member.acceptedAt ? "Active" : "Pending"}
                        </Badge>
                      </Group>
                    </Box>
                  </Group>

                  {isOwner && member.role !== 'OWNER' && (
                    <Tooltip label="Revoke Access">
                      <ActionIcon
                        variant="subtle"
                        color="review"
                        onClick={() => handleRemove(member.id)}
                        size="lg"
                      >
                        <Trash2 size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </UnifiedCardSection>
            ))}
          </Stack>
        </Stack>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
