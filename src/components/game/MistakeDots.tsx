import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { t } from '@/i18n';
import { MISTAKES_ALLOWED } from '@/logic/puzzle';
import { spacing, useTheme } from '@/theme';

/**
 * How many mistakes are left, as dots.
 *
 * The count is also in the accessibility label, spelled out: four dots and
 * three dots are indistinguishable to a screen reader, and "how close am I to
 * losing" is the single most important number on this screen.
 */
export function MistakeDots({ left }: { left: number }) {
  const { colors } = useTheme();
  const remaining = Math.max(0, Math.min(MISTAKES_ALLOWED, left));

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${t('mistakesLeft')}: ${remaining}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <Text variant="caption" tone="muted">
        {t('mistakesLeft')}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {Array.from({ length: MISTAKES_ALLOWED }, (_, i) => (
          <View
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: i < remaining ? colors.textMuted : 'transparent',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}
