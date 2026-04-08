import Link from "next/link";
import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";

import type { ExpertTip } from "@/content/help";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ExpertTipCardProps = {
  tip: ExpertTip;
};

export function ExpertTipCard({ tip }: ExpertTipCardProps) {
  return (
    <Card className="h-full border-amber-200/80 bg-gradient-to-br from-amber-50 via-background to-orange-50 dark:border-amber-500/20 dark:from-amber-500/10 dark:via-background dark:to-orange-500/10">
      <CardHeader className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <Lightbulb className="h-5 w-5" />
          </div>
          <Badge variant="outline" className="border-amber-300/70 bg-background/70 text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">
            {tip.category}
          </Badge>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-xl md:text-2xl">{tip.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{tip.body}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="rounded-lg border border-border/80 bg-card/80 p-3 text-sm text-foreground">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Why this matters
          </div>
          <p>{tip.whyItMatters}</p>
        </div>

        {tip.samplePhrases && tip.samplePhrases.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Useful wording</p>
            <div className="space-y-2">
              {tip.samplePhrases.map((phrase) => (
                <div key={phrase} className="rounded-lg border border-dashed border-border/80 bg-background/70 px-3 py-2 text-sm text-foreground">
                  “{phrase}”
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={tip.ctaHref}>
              {tip.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/manual">Manual</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/faq">FAQ</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
