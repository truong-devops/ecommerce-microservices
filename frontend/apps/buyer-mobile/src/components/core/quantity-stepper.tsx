import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';
import { AppIcon } from './app-icon';

export function QuantityStepper({ quantity, onChange }: { quantity: number; onChange(quantity: number): void }) {
  return (
    <View style={styles.wrapper}>
      <Pressable accessibilityLabel="Giảm số lượng" onPress={() => onChange(Math.max(1, quantity - 1))} style={styles.button}>
        <AppIcon color={colors.muted} name="remove" size={16} />
      </Pressable>
      <Text style={styles.count}>{quantity}</Text>
      <Pressable accessibilityLabel="Tăng số lượng" onPress={() => onChange(quantity + 1)} style={styles.button}>
        <AppIcon color={colors.muted} name="add" size={16} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', backgroundColor: '#f7f7f7', borderRadius: radius.sm, flexDirection: 'row' },
  button: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radius.sm,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  count: { color: colors.ink, minWidth: 38, textAlign: 'center', paddingHorizontal: spacing[1] }
});
