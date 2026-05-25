import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

export function ScreenState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing[2],
    justifyContent: 'center',
    padding: spacing[6]
  },
  title: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '700',
    textAlign: 'center'
  },
  detail: {
    color: colors.muted,
    fontSize: typography.body,
    textAlign: 'center'
  }
});
