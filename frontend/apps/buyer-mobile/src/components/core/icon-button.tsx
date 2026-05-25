import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme/tokens';

import { AppIcon, type AppIconName } from './app-icon';

export function IconButton({
  accessibilityLabel,
  badge,
  color = colors.ink,
  name,
  onPress,
  size = 25,
}: {
  accessibilityLabel: string;
  badge?: number;
  color?: string;
  name: AppIconName;
  onPress(): void;
  size?: number;
}) {
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={styles.button}>
      <AppIcon color={color} name={name} size={size} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    position: 'relative',
    width: 38,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 17,
    paddingHorizontal: 3,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: '800',
  },
});
