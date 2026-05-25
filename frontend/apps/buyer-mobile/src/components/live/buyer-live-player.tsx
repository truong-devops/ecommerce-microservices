import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { PlaybackSource } from '@/domain/media-playback';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { WHEPLivePlayer } from './whep-live-player';

interface BuyerLivePlayerProps {
  immersive?: boolean;
  source: PlaybackSource;
  state: 'playable' | 'thumbnail-only' | 'missing' | 'invalid' | 'paused' | 'ended';
  pausedLabel: string;
  endedLabel: string;
  noPlaybackLabel: string;
}

export function BuyerLivePlayer({ immersive, source, state, pausedLabel, endedLabel, noPlaybackLabel }: BuyerLivePlayerProps) {
  if (source.kind === 'webrtc' && source.url && state === 'playable') {
    return <WHEPLivePlayer immersive={immersive} url={source.url} />;
  }

  return (
    <ExpoLivePlayer
      endedLabel={endedLabel}
      immersive={immersive}
      noPlaybackLabel={noPlaybackLabel}
      pausedLabel={pausedLabel}
      source={source}
      state={state}
    />
  );
}

function ExpoLivePlayer({ immersive, source, state, pausedLabel, endedLabel, noPlaybackLabel }: BuyerLivePlayerProps) {
  const player = useVideoPlayer(source.url ?? '', (instance) => {
    instance.loop = false;
  });
  const { status: playerStatus } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (source.url && state === 'playable') {
      player.play();
      return;
    }
    player.pause();
  }, [player, source.url, state]);

  if (source.url && state === 'playable' && playerStatus !== 'error') {
    return <VideoView player={player} style={[styles.video, immersive ? styles.immersive : null]} contentFit="cover" fullscreenOptions={{ enable: true }} allowsPictureInPicture />;
  }

  const hasPlaybackError = source.url && state === 'playable' && playerStatus === 'error';
  const label = hasPlaybackError
    ? 'Livestream chưa phát video.'
    : state === 'paused'
      ? pausedLabel
      : state === 'ended'
        ? endedLabel
        : state === 'invalid'
          ? 'Không mở được nguồn phát live.'
          : noPlaybackLabel;
  const subtitle = hasPlaybackError
    ? 'Phiên vẫn đang mở nhưng seller chưa phát camera hoặc stream vừa bị ngắt.'
    : 'Sản phẩm ghim và chat vẫn hiển thị khi phiên live chưa có stream.';

  return (
    <View style={[styles.fallback, immersive ? styles.immersive : null]}>
      {source.thumbnailUrl ? <Image source={{ uri: source.thumbnailUrl }} style={styles.fallbackImage} /> : null}
      <View style={styles.fallbackCopy}>
        <Text style={styles.fallbackTitle}>{label}</Text>
        <Text style={styles.fallbackSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  video: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: radius.md,
    overflow: 'hidden',
    width: '100%'
  },
  fallback: {
    aspectRatio: 16 / 9,
    backgroundColor: '#111111',
    borderRadius: radius.md,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%'
  },
  immersive: {
    aspectRatio: 3 / 4,
    borderRadius: 0,
  },
  fallbackImage: {
    height: '100%',
    opacity: 0.6,
    position: 'absolute',
    width: '100%'
  },
  fallbackCopy: {
    gap: spacing[2],
    padding: spacing[4]
  },
  fallbackTitle: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center'
  },
  fallbackSubtitle: {
    color: '#e5e7eb',
    fontSize: typography.body,
    lineHeight: 20,
    textAlign: 'center'
  }
});
