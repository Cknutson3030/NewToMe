import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  style?: ViewStyle | any;
  accessibilityLabel?: string;
};

export default function Button({ children, onPress, variant = 'primary', style, accessibilityLabel }: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme.colors, theme.spacing, theme.radii);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.base, variant === 'ghost' ? styles.ghost : styles.primary, pressed && styles.pressed, style]}
    >
      <Text style={styles.label as TextStyle}>{children as any}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: any, spacing: any, radii: any) =>
  StyleSheet.create({
    base: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: {
      backgroundColor: colors.primary,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: { opacity: 0.85 },
    label: { color: '#fff', fontWeight: '600' },
  });
