import { useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, Share, View } from "react-native";

import { BannerAdSlot } from "@/components/BannerAdSlot";
import { MistakeDots, SolvedBand, WordTile } from "@/components/game";
import { Button, IconButton, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { guessRows, mistakesLeft, unsolvedGroups } from "@/logic/guess";
import { GROUPS_PER_PUZZLE, WORDS_PER_GROUP, type Group } from "@/logic/puzzle";
import { shareText } from "@/logic/share";
import { useGameStore } from "@/store/useGameStore";
import { useTheme } from "@/theme";

/** The board is four across, which is what makes a row a candidate group. */
const COLUMNS = WORDS_PER_GROUP;

function Feedback() {
  const outcome = useGameStore((s) => s.lastOutcome);
  const { spacing } = useTheme();

  // Only the two the player can act on. "wrong" is already told by a mistake
  // dot going out, and repeating it in words adds nothing; "correct" is told by
  // the band appearing.
  const message =
    outcome?.kind === "oneAway"
      ? t("oneAway")
      : outcome?.kind === "invalid" && outcome.reason === "repeat"
        ? t("alreadyGuessed")
        : null;

  return (
    <View
      style={{ minHeight: 24, justifyContent: "center", marginTop: spacing.sm }}
    >
      {message ? (
        <Text
          variant="caption"
          tone="accent"
          align="center"
          accessibilityLiveRegion="polite"
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function Unavailable() {
  const shortfall = useGameStore((s) => s.shortfall);
  const load = useGameStore((s) => s.load);
  const { spacing } = useTheme();

  // Three genuinely different situations, told apart rather than blurred into
  // one "something went wrong": the player's connection, our server, and the
  // feed having no puzzle for a day yet. Only the first is theirs to fix.
  const [title, body] =
    shortfall?.kind === "offline"
      ? [t("offlineTitle"), t("offlineBody")]
      : shortfall?.kind === "exhausted"
        ? [t("exhaustedTitle"), t("exhaustedBody")]
        : [t("feedUnavailableTitle"), t("feedUnavailableBody")];

  return (
    <View style={{ paddingVertical: spacing["3xl"], gap: spacing.md }}>
      <Text variant="title" align="center">
        {title}
      </Text>
      <Text variant="body" tone="muted" align="center">
        {body}
      </Text>
      <Button
        label={t("retry")}
        variant="secondary"
        onPress={() => void load()}
        style={{ marginTop: spacing.base }}
      />
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const phase = useGameStore((s) => s.phase);
  const session = useGameStore((s) => s.session);
  const selection = useGameStore((s) => s.selection);
  const puzzleNumber = useGameStore((s) => s.puzzleNumber);
  const key = useGameStore((s) => s.key);
  const load = useGameStore((s) => s.load);
  const toggle = useGameStore((s) => s.toggle);
  const submit = useGameStore((s) => s.submit);
  const shuffle = useGameStore((s) => s.shuffle);
  const clearSelection = useGameStore((s) => s.clearSelection);

  useEffect(() => {
    if (useGameStore.getState().phase === "idle") void load();
  }, [load]);

  const finished = session !== null && session.status !== "playing";

  /**
   * The bands to show, in the order they were found, with any unfound group
   * appended once the game is over. Recomputed from the session rather than
   * accumulated, so a restored session renders exactly what the player left.
   */
  const bands: Group[] = useMemo(() => {
    if (session === null) return [];
    const byTheme = new Map(session.puzzle.groups.map((g) => [g.theme, g]));
    const found = session.solved.flatMap((theme) => {
      const group = byTheme.get(theme);
      return group ? [group] : [];
    });
    return finished ? [...found, ...unsolvedGroups(session)] : found;
  }, [session, finished]);

  const onShare = () => {
    if (session === null || key === null || session.status === "playing")
      return;
    const text = shareText({
      key,
      puzzleNumber,
      rows: guessRows(session),
      status: session.status,
      title: t("appName"),
    });
    if (text !== null) void Share.share({ message: text });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll topInset>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: spacing.lg,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="title">{t("todayTitle")}</Text>
            {phase === "ready" ? (
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {t("groupsFound", { n: String(session?.solved.length ?? 0) })}
              </Text>
            ) : null}
          </View>
          <IconButton
            icon="settings"
            accessibilityLabel={t("settingsTitle")}
            onPress={() => router.push("/settings")}
          />
        </View>

        {phase === "loading" || phase === "idle" ? (
          <View
            style={{ paddingVertical: spacing["4xl"], alignItems: "center" }}
          >
            <ActivityIndicator color={colors.textMuted} />
            <Text
              variant="caption"
              tone="muted"
              style={{ marginTop: spacing.md }}
            >
              {t("loading")}
            </Text>
          </View>
        ) : null}

        {phase === "unavailable" ? <Unavailable /> : null}

        {phase === "ready" && session !== null ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            {/* The one instruction the player needs before touching a tile
                belongs above the grid, not buried below the submit button
                where testers reported it read as an afterthought. */}
            {!finished ? (
              <Text variant="caption" tone="faint" align="center">
                {t("pickFour")}
              </Text>
            ) : null}

            {bands.map((group) => (
              <SolvedBand key={group.theme} group={group} />
            ))}

            {/* A wrapping row rather than a FlatList: sixteen tiles that must
                all be on screen at once, where virtualisation would only add
                measurement passes and a scroll the game does not want. */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              {session.board.map((word) => (
                <View
                  key={word}
                  style={{
                    width: `${100 / COLUMNS}%`,
                    flexBasis: `${100 / COLUMNS}%`,
                    flexGrow: 1,
                  }}
                >
                  <WordTile
                    word={word}
                    selected={selection.includes(word)}
                    disabled={finished}
                    onPress={toggle}
                  />
                </View>
              ))}
            </View>

            <Feedback />

            {finished ? (
              <View style={{ gap: spacing.md, marginTop: spacing.base }}>
                <Text variant="heading" align="center">
                  {session.status === "won" ? t("wonTitle") : t("lostTitle")}
                </Text>
                <Button
                  label={t("shareResult")}
                  icon="share"
                  onPress={onShare}
                  fullWidth
                />
                <Text variant="caption" tone="muted" align="center">
                  {t("comeBackTomorrow")}
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.md, marginTop: spacing.base }}>
                <View style={{ alignItems: "center" }}>
                  <MistakeDots left={mistakesLeft(session)} />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t("shuffle")}
                      variant="secondary"
                      onPress={shuffle}
                      fullWidth
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t("deselect")}
                      variant="ghost"
                      disabled={selection.length === 0}
                      onPress={clearSelection}
                      fullWidth
                    />
                  </View>
                </View>
                <Button
                  label={t("submitGuess")}
                  size="lg"
                  fullWidth
                  // Enabled only on a complete guess. A submit that can only
                  // fail is a button that teaches the player to distrust it.
                  disabled={selection.length !== WORDS_PER_GROUP}
                  onPress={() => void submit()}
                />
              </View>
            )}

            {finished ? (
              <View style={{ marginTop: spacing.xl }}>
                <Text variant="caption" tone="muted">
                  {t("answersTitle")}
                </Text>
                <Text
                  variant="caption"
                  tone="faint"
                  style={{ marginTop: spacing.xs }}
                >
                  {`${bands.length}/${GROUPS_PER_PUZZLE}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Screen>
      <BannerAdSlot />
    </View>
  );
}
