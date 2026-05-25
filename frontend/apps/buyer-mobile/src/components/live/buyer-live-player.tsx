import { VideoView, useVideoPlayer } from 'expo-video';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { PlaybackSource } from '@/domain/media-playback';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface BuyerLivePlayerProps {
  source: PlaybackSource;
  state: 'playable' | 'thumbnail-only' | 'missing' | 'invalid' | 'paused' | 'ended';
  pausedLabel: string;
  endedLabel: string;
  noPlaybackLabel: string;
}

export function BuyerLivePlayer({ source, state, pausedLabel, endedLabel, noPlaybackLabel }: BuyerLivePlayerProps) {
  const player = useVideoPlayer(source.url ?? '', (instance) => {
    instance.loop = false;
  });

  if (source.url && state === 'playable') {
    return <VideoView player={player} style={styles.video} contentFit="cover" allowsFullscreen allowsPictureInPicture />;
  }

  const label = state === 'paused' ? pausedLabel : state === 'ended' ? endedLabel : state === 'invalid' ? 'Không mở được nguồn phát live.' : noPlaybackLabel;

  return (
    <View style={styles.fallback}>
      {source.thumbnailUrl ? <Image source={{ uri: source.thumbnailUrl }} style={styles.fallbackImage} /> : null}
      <View style={styles.fallbackCopy}>
        <Text style={styles.fallbackTitle}>{label}</Text>
        <Text style={styles.fallbackSubtitle}>Sản phẩm ghim và chat vẫn hiển thị khi phiên live chưa có stream.</Text>
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
