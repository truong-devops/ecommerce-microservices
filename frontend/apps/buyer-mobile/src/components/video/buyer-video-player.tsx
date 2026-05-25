import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { PlaybackSource } from '@/domain/media-playback';
import { colors, spacing, typography } from '@/theme/tokens';

interface BuyerVideoPlayerProps {
  source: PlaybackSource;
  noMediaLabel: string;
  active?: boolean;
  muted?: boolean;
}

export function BuyerVideoPlayer({ source, noMediaLabel, active = true, muted = true }: BuyerVideoPlayerProps) {
  const player = useVideoPlayer(source.url ?? '', (instance) => {
    instance.loop = true;
    instance.muted = muted;
  });

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      return;
    }
    if (!source.url) return;
    try {
      if (active) {
        player.play();
      } else {
        player.pause();
      }
    } catch {
      // FlatList can recycle an expo-video native object before React finishes
      // running the effect. Ignore stale native handles and let the next mounted
      // player instance control playback.
    }
  }, [active, muted, player, source.url]);

  if (!source.url) {
    return (
      <View style={styles.fallback}>
        {source.thumbnailUrl ? <Image source={{ uri: source.thumbnailUrl }} style={styles.thumbnail} /> : null}
        <View style={styles.fallbackOverlay}>
          <Text style={styles.fallbackTitle}>{source.status === 'invalid' ? 'Không mở được media URL' : noMediaLabel}</Text>
          <Text style={styles.fallbackSubtitle}>Nguồn phát chưa sẵn sàng, bạn vẫn có thể xem sản phẩm và bình luận.</Text>
        </View>
      </View>
    );
  }

  return <VideoView player={player} style={styles.video} contentFit="cover" fullscreenOptions={{ enable: false }} nativeControls={false} allowsPictureInPicture={false} />;
}

const styles = StyleSheet.create({
  video: {
    backgroundColor: '#000000',
    flex: 1,
    width: '100%'
  },
  fallback: {
    backgroundColor: '#111111',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%'
  },
  thumbnail: {
    height: '100%',
    opacity: 0.72,
    position: 'absolute',
    width: '100%'
  },
  fallbackOverlay: {
    gap: spacing[2],
    padding: spacing[5]
  },
  fallbackTitle: {
    color: colors.surface,
    fontSize: 20,
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
