import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type WHEPStatus = 'connecting' | 'playing' | 'error';

interface WHEPLivePlayerProps {
  immersive?: boolean;
  url: string;
}

export function WHEPLivePlayer({ immersive, url }: WHEPLivePlayerProps) {
  const [status, setStatus] = useState<WHEPStatus>('connecting');
  const document = useMemo(() => buildWhepDocument(url), [url]);

  useEffect(() => {
    setStatus('connecting');
  }, [url]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { type?: WHEPStatus };
      if (payload.type === 'connecting' || payload.type === 'playing' || payload.type === 'error') {
        setStatus(payload.type);
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <View style={[styles.player, immersive ? styles.immersive : null]}>
      <WebView
        allowsInlineMediaPlayback
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        onMessage={onMessage}
        originWhitelist={['*']}
        source={{ html: document, baseUrl: 'https://buyer.dt-commerce.site/' }}
        style={styles.webview}
      />
      {status !== 'playing' ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.title}>{status === 'error' ? 'Đang chờ nguồn phát live...' : 'Đang kết nối livestream...'}</Text>
          <Text style={styles.subtitle}>App sẽ tự kết nối lại khi seller bắt đầu phát camera.</Text>
        </View>
      ) : null}
    </View>
  );
}

function buildWhepDocument(url: string): string {
  const endpoint = JSON.stringify(url);
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <style>
      html, body, video { background: #000; height: 100%; margin: 0; width: 100%; }
      video { object-fit: cover; }
    </style>
  </head>
  <body>
    <video id="live" autoplay playsinline></video>
    <script>
      (() => {
        const endpoint = ${endpoint};
        const video = document.getElementById('live');
        let peer = null;
        let retryTimer = null;
        let frameTimer = null;
        let disconnectTimer = null;
        let closed = false;
        let hasPlayed = false;
        let hasVideoTrack = false;

        const send = (type) => window.ReactNativeWebView.postMessage(JSON.stringify({ type }));
        const clearTimers = () => {
          clearTimeout(retryTimer);
          clearTimeout(frameTimer);
          clearTimeout(disconnectTimer);
          retryTimer = null;
          frameTimer = null;
          disconnectTimer = null;
        };
        const cleanup = () => {
          clearTimers();
          if (peer) peer.close();
          peer = null;
          video.srcObject = null;
        };
        const retryNow = (showWaiting) => {
          cleanup();
          if (closed) return;
          if (showWaiting || !hasPlayed) send('error');
          retryTimer = setTimeout(connect, hasPlayed ? 2000 : 3000);
        };
        const scheduleRetry = (delayMs, showWaiting) => {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => retryNow(showWaiting), delayMs);
        };
        const waitForIce = (current) => new Promise((resolve) => {
          if (current.iceGatheringState === 'complete') return resolve();
          const timeout = setTimeout(resolve, 5000);
          current.addEventListener('icegatheringstatechange', () => {
            if (current.iceGatheringState === 'complete') {
              clearTimeout(timeout);
              resolve();
            }
          });
        });
        const connect = async () => {
          cleanup();
          hasVideoTrack = false;
          if (!hasPlayed) send('connecting');
          try {
            const current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peer = current;
            const stream = new MediaStream();
            current.addTransceiver('video', { direction: 'recvonly' });
            current.addTransceiver('audio', { direction: 'recvonly' });
            current.ontrack = (event) => {
              if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
              video.srcObject = stream;
              void video.play().catch(() => undefined);
              if (event.track.kind === 'video') {
                hasVideoTrack = true;
                hasPlayed = true;
                clearTimeout(frameTimer);
                send('playing');
              }
            };
            video.onplaying = () => {
              if (video.srcObject && hasVideoTrack) {
                hasPlayed = true;
                clearTimeout(frameTimer);
                send('playing');
              }
            };
            current.onconnectionstatechange = () => {
              if (current.connectionState === 'connected') {
                clearTimeout(disconnectTimer);
                disconnectTimer = null;
                if (hasVideoTrack) {
                  hasPlayed = true;
                  send('playing');
                }
              }
              if (current.connectionState === 'disconnected') {
                clearTimeout(disconnectTimer);
                disconnectTimer = setTimeout(() => {
                  if (peer === current && current.connectionState === 'disconnected') {
                    retryNow(true);
                  }
                }, hasPlayed ? 12000 : 5000);
              }
              if (current.connectionState === 'failed' || current.connectionState === 'closed') {
                retryNow(!hasPlayed);
              }
            };
            const offer = await current.createOffer();
            await current.setLocalDescription(offer);
            await waitForIce(current);
            if (!current.localDescription || !current.localDescription.sdp) throw new Error('missing_sdp');
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/sdp' },
              body: current.localDescription.sdp
            });
            if (!response.ok) throw new Error('whep_' + response.status);
            const answer = await response.text();
            await current.setRemoteDescription({ type: 'answer', sdp: answer });
            frameTimer = setTimeout(() => {
              if (!hasVideoTrack) {
                retryNow(true);
              }
            }, hasPlayed ? 20000 : 15000);
          } catch (_) {
            scheduleRetry(3000, true);
          }
        };
        window.addEventListener('beforeunload', () => { closed = true; cleanup(); });
        connect();
      })();
    </script>
  </body>
</html>`;
}

const styles = StyleSheet.create({
  immersive: {
    aspectRatio: 3 / 4,
    borderRadius: 0
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: '#111111',
    gap: spacing[2],
    height: '100%',
    justifyContent: 'center',
    padding: spacing[4],
    position: 'absolute',
    width: '100%'
  },
  player: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: radius.md,
    overflow: 'hidden',
    width: '100%'
  },
  subtitle: {
    color: '#e5e7eb',
    fontSize: typography.body,
    lineHeight: 20,
    textAlign: 'center'
  },
  title: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center'
  },
  webview: {
    backgroundColor: '#000000',
    height: '100%',
    width: '100%'
  }
});
