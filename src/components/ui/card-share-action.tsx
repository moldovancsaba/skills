'use client';

import { ActionIcon, Tooltip } from "@/components/gds/primitives";
import { useClipboard } from "@/components/gds/hooks";
import { IconCheck as Check, IconShare as Share } from "@/components/gds/icons";
import { buildCardShareUrl } from "@/lib/card-share";

type CardShareActionProps = {
  cardId: string;
  label?: string;
  color?: string;
  size?: string | number;
  variant?: string;
  stopPropagation?: boolean;
};

export function CardShareAction({
  cardId,
  label = "Share card",
  color = "gray",
  size = "lg",
  variant = "subtle",
  stopPropagation = true,
}: CardShareActionProps) {
  const clipboard = useClipboard({ timeout: 1500 });

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
    clipboard.copy(buildCardShareUrl(cardId));
  };

  return (
    <Tooltip label={clipboard.copied ? "Copied" : label}>
      <ActionIcon
        variant={variant as any}
        size={size as any}
        color={clipboard.copied ? "green" : color}
        onClick={handleClick}
        aria-label={clipboard.copied ? "Copied" : label}
      >
        {clipboard.copied ? <Check size={16} /> : <Share size={16} />}
      </ActionIcon>
    </Tooltip>
  );
}
