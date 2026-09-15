import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import type { Group } from '@/logic/puzzle';
import { difficultyColors, radius, spacing, useTheme } from '@/theme';

/**
 * A group the player has found, or one revealed after the fourth mistake.
 *
 * The theme and its four words both appear: the reveal is the payoff, and a
 * band that only named the theme would leave a losing player to work out which
 * words it meant.
 */
export function SolvedBand({ group }: { group: Group }) {
  const { colors } = useTheme();
  const tone = difficultyColors(colors)[group.difficulty];

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${group.theme}: ${group.words.join(', ')}`}
      style={{
        backgroundColor: tone.fill,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.base,
        alignItems: 'center',
      }}
    >
      <Text variant="bodyStrong" align="center" color={tone.onFill}>
        {group.theme}
      </Text>
      <Text variant="caption" align="center" color={tone.onFill} style={{ marginTop: 2 }}>
        {group.words.join(' · ')}
      </Text>
    </View>
  );
}
