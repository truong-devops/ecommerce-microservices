import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

interface PrimaryButtonProps extends PropsWithChildren {
  disabled?: boolean;
  loading?: boolean;
  onPress(): void;
  variant?: 'primary' | 'outline';
}

export function PrimaryButton({ children, disabled, loading, onPress, variant = 'primary' }: PrimaryButtonProps) {
  const outline = variant === 'outline';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.button, outline ? styles.outline : styles.primary, disabled ? styles.disabled : null]}
    >
      {loading ? <ActivityIndicator color={outline ? colors.brand : colors.surface} /> : null}
      <Text style={[styles.label, outline ? styles.outlineLabel : null]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing[2],
    height: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing[4]
  },
  primary: {
    backgroundColor: colors.brand
  },
  outline: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderWidth: 1
  },
  disabled: {
    opacity: 0.55
  },
  label: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: '700'
  },
  outlineLabel: {
    color: colors.brand
  }
});
