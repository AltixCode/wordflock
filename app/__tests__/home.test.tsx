import { act, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Share } from 'react-native';

import Home from '../index';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { MISTAKES_ALLOWED } from '@/logic/puzzle';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { useGameStore } from '@/store/useGameStore';
import { usePremiumStore } from '@/store/usePremiumStore';

jest.mock('@/content/sync', () => ({
  syncContent: jest.fn().mockResolvedValue({ feedReachable: true, packsAdded: [], problems: [] }),
  servedThrough: jest.fn().mockResolvedValue(null),
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

const { getNetworkStateAsync } = jest.requireMock('expo-network');
const { servedThrough } = jest.requireMock('@/content/sync');

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useGameStore.getState().resetForTests();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
  getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  servedThrough.mockResolvedValue(null);
});

// No `jest.restoreAllMocks()` here. It restores every spy in the process, not
// only this file's — including ones the renderer itself relies on — and the
// next test's tree then renders and is immediately torn down, which surfaces as
// "unable to find an element" on a screen that plainly renders it in isolation.

/** Renders, and waits for the board to arrive rather than for a fixed tick. */
async function renderBoard() {
  const view = await renderWithProviders(<Home />);
  await waitFor(() => expect(useGameStore.getState().phase).toBe('ready'));
  return view;
}

const board = () => useGameStore.getState().session!.board;
const groups = () => useGameStore.getState().session!.puzzle.groups;

describe('Home', () => {
  it('reaches a full sixteen-tile board and routes to settings', async () => {
    const { getByLabelText, getByText } = await renderBoard();
    for (const word of board()) expect(getByLabelText(word)).toBeTruthy();
    expect(getByText(t('todayTitle'))).toBeTruthy();

    await act(async () => fireEvent.press(getByLabelText(t('settingsTitle'))));
    expect(testRouter.push).toHaveBeenCalledWith('/settings');
  });

  it('keeps submit unreachable until exactly four are chosen', async () => {
    const { getByLabelText, getByText } = await renderBoard();
    const submit = getByText(t('submitGuess'));
    expect(submit).toBeDisabled();

    for (const w of board().slice(0, 3)) await act(async () => fireEvent.press(getByLabelText(w)));
    expect(submit).toBeDisabled();

    await act(async () => fireEvent.press(getByLabelText(board()[3]!)));
    expect(submit).not.toBeDisabled();
  });

  it('marks a chosen tile as selected for a screen reader, not only visually', async () => {
    const { getByLabelText } = await renderBoard();
    const word = board()[0]!;
    await act(async () => fireEvent.press(getByLabelText(word)));
    expect(getByLabelText(word).props.accessibilityState.selected).toBe(true);
  });

  it('shows the found group as a band and takes it off the board', async () => {
    const { getByLabelText, getByText, queryByLabelText } = await renderBoard();
    const group = groups()[0]!;
    for (const w of group.words) await act(async () => fireEvent.press(getByLabelText(w)));
    await act(async () => fireEvent.press(getByText(t('submitGuess'))));

    expect(getByText(group.theme)).toBeTruthy();
    for (const w of group.words) expect(queryByLabelText(w)).toBeNull();
  });

  it('tells the player when they were one away', async () => {
    const { getByLabelText, getByText } = await renderBoard();
    const [a, b] = groups();
    for (const w of [...a!.words.slice(0, 3), b!.words[0]!]) {
      await act(async () => fireEvent.press(getByLabelText(w)));
    }
    await act(async () => fireEvent.press(getByText(t('submitGuess'))));
    expect(getByText(t('oneAway'))).toBeTruthy();
  });

  it('reveals every group and offers a share once the game is lost', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    const { getByLabelText, getByText } = await renderBoard();

    for (let i = 0; i < MISTAKES_ALLOWED; i += 1) {
      for (const g of groups()) await act(async () => fireEvent.press(getByLabelText(g.words[i]!)));
      await act(async () => fireEvent.press(getByText(t('submitGuess'))));
    }

    expect(getByText(t('lostTitle'))).toBeTruthy();
    // A losing player is shown the answers; that is the payoff for the day.
    for (const g of groups()) expect(getByText(g.theme)).toBeTruthy();

    await act(async () => fireEvent.press(getByText(t('shareResult'))));
    expect(share).toHaveBeenCalledTimes(1);
    const message = share.mock.calls[0]![0] as { message: string };
    // The grid must never leak which words were where.
    for (const g of groups()) expect(message.message).not.toContain(g.words[0]);
  });

  it('tells an offline player it is their connection, not ours', async () => {
    await AsyncStorage.setItem('wordflock.installedOn.v1', '2026-01-01');
    getNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    useGameStore.setState({ phase: 'idle' });
    const { getByText } = await renderWithProviders(<Home />);
    await act(async () => useGameStore.getState().load('2029-01-01'));
    expect(getByText(t('offlineTitle'))).toBeTruthy();
  });

  it('blames itself, not the player, when the feed is unreachable', async () => {
    await AsyncStorage.setItem('wordflock.installedOn.v1', '2026-01-01');
    const { getByText } = await renderWithProviders(<Home />);
    await act(async () => useGameStore.getState().load('2029-01-01'));
    expect(getByText(t('feedUnavailableTitle'))).toBeTruthy();
  });

  it('shows a banner to a free user', async () => {
    const { queryByTestId } = await renderBoard();
    expect(queryByTestId('banner-ad')).not.toBeNull();
  });

  it('shows no banner to a premium user — the whole point of the upgrade', async () => {
    usePremiumStore.setState({ isPremium: true });
    const { queryByTestId } = await renderBoard();
    expect(queryByTestId('banner-ad')).toBeNull();
  });
});
