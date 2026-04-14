'use client';

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardActions 
} from "@/components/ui/unified-card";
import { FormInput } from "@/components/ui/form-fields";
import { Users, UserPlus, Trash2, Shield, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    void fetchMembers();
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

  if (loading) return <div className="animate-pulse h-48 bg-zinc-900/40 rounded-xl border border-zinc-800" />;

  return (
    <UnifiedCard className="h-full">
      <UnifiedCardHeader
        supporting={
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/40 text-zinc-400">
              <Users className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Access Control</span>
          </div>
        }
        title="Team Members"
        description="Invite users by email to collaborate on this company."
      />

      <UnifiedCardBody className="space-y-6">
        {isOwner && (
          <form onSubmit={handleInvite} className="flex gap-2">
            <FormInput
              placeholder="team@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="flex-1 bg-zinc-900/60 border-zinc-800"
            />
            <Button type="submit" disabled={inviting} variant="secondary" className="gap-2 shrink-0">
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          </form>
        )}

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {members.map((member) => (
              <motion.div
                key={member.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/20"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-zinc-800/60 flex items-center justify-center shrink-0">
                    <UserIcon className="h-4 w-4 text-zinc-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{member.email}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Shield className={`h-3 w-3 ${member.role === 'OWNER' ? 'text-amber-500' : 'text-zinc-500'}`} />
                        <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">
                          {member.role === 'OWNER' ? 'ADMIN' : 'MEMBER'}
                        </span>
                      </div>
                      <span className={`text-[9px] uppercase tracking-wider font-bold ${member.acceptedAt ? 'text-green-500/80' : 'text-zinc-600'}`}>
                        {member.acceptedAt ? "ACTIVE" : "PENDING"}
                      </span>
                    </div>
                  </div>
                </div>
                {isOwner && member.role !== 'OWNER' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(member.id)}
                    className="h-8 w-8 text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
