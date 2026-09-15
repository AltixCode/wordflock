import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

export interface WordTileProps {
  word: string;
  selected: boolean;
  disabled?: boolean;
  onPress: (word: string) => void;
}

/**
 * One word on the board.
 *
 * Selection is shown three ways at once — fill, border and the accessibility
 * state — because a single cue fails somebody: fill alone disappears for a
 * player who cannot separate the two colours, and border alone is easy to miss
 * on a small tile. `accessibilityState.selected` is what VoiceOver reads, and
 * it is the only one that survives the screen being read aloud.
 */
export function WordTile({ word, selected, disabled = false, onPress }: WordTileProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={word}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress(word);
      }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: MIN_TOUCH_TARGET + spacing.base,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.surfaceAlt : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xs,
        paddingVertical: spacing.sm,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View pointerEvents="none">
        {/* Long words shrink rather than truncate: a word the player cannot
            read is a word they cannot reason about, and these are the whole
            puzzle. */}
        <Text
          variant="caption"
          align="center"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {word}
        </Text>
      </View>
    </Pressable>
  );
}
