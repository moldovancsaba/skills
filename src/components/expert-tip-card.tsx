import Link from "next/link";
import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";

import type { ExpertTip } from "@/content/help";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <UnifiedCard className="h-full bg-gradient-to-br from-amber-500/5 via-zinc-950/40 to-orange-500/5">
      <UnifiedCardHeader
        supporting={
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Lightbulb className="h-4 w-4" />
            </div>
            <Badge variant="outline" className="border-amber-500/20 bg-amber-500/5 text-[10px] uppercase tracking-wider font-bold text-amber-200">
              {tip.category}
            </Badge>
          </div>
        }
        title={tip.title}
        description={tip.body}
      />
      
      <UnifiedCardBody className="space-y-4">
        <div className="rounded-lg border border-amber-500/10 bg-amber-500/[0.02] p-3 text-sm text-zinc-300">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-500/70">
            <Sparkles className="h-3 w-3" />
            Strategic Rationale
          </div>
          <p className="leading-relaxed">{tip.whyItMatters}</p>
        </div>

        {tip.samplePhrases && tip.samplePhrases.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Suggested Phrasing</p>
            <div className="space-y-1.5">
              {tip.samplePhrases.map((phrase) => (
                <div key={phrase} className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs italic text-zinc-400">
                  “{phrase}”
                </div>
              ))}
            </div>
          </div>
        )}
      </UnifiedCardBody>

      <UnifiedCardActions>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-500 text-white border-0">
            <Link href={tip.ctaHref}>
              {tip.ctaLabel}
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40">
            <Link href="/faq">FAQ</Link>
          </Button>
        </div>
      </UnifiedCardActions>
    </UnifiedCard>
  );
}
