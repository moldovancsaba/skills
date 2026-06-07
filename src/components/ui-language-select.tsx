'use client';

import { Select, Stack } from "@/components/gds/primitives";
import { IconLanguage as LanguageIcon } from "@/components/gds/icons";
import { UI_LANGUAGE_OPTIONS, useI18n, type UiLanguage } from "@/lib/ui-i18n";
import { MetaText } from "@/components/ui/typography";

type UiLanguageSelectProps = {
  withLabel?: boolean;
  withDescription?: boolean;
  size?: "xs" | "sm" | "md";
};

export function UiLanguageSelect({
  withLabel = true,
  withDescription = true,
  size = "sm",
}: UiLanguageSelectProps) {
  const { language, setLanguage, t } = useI18n();

  return (
    <Stack gap={4}>
      <Select
        label={withLabel ? t("uiLanguage.label") : undefined}
        description={withDescription ? t("uiLanguage.description") : undefined}
        placeholder={t("uiLanguage.placeholder")}
        value={language}
        onChange={(value) => {
          if (!value) return;
          setLanguage(value as UiLanguage);
        }}
        data={UI_LANGUAGE_OPTIONS.map((option) => ({
          value: option.value,
          label: `${option.label} · ${option.nativeName}`,
        }))}
        allowDeselect={false}
        searchable={false}
        leftSection={<LanguageIcon size={16} />}
        size={size}
      />
      {withDescription ? <MetaText>{t("uiLanguage.helper")}</MetaText> : null}
    </Stack>
  );
}
