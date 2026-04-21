import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  style?: ViewStyle | any;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  disabled?: boolean;
  fullWidth?: boolean;
};

export default function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  style,
  textStyle,
  accessibilityLabel,
  disabled,
  fullWidth,
}: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme.colors, theme.spacing, theme.radii);

  const containerStyle = [
    styles.base,
    styles[`size_${size}` as const],
    styles[`variant_${variant}` as const],
    fullWidth && styles.fullWidth,
  ];

  const labelBase =
    variant === 'primary' || variant === 'danger'
      ? styles.labelOnColor
      : variant === 'secondary'
      ? styles.labelSecondary
      : styles.labelGhost;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.labelBase,
          styles[`labelSize_${size}` as const],
          labelBase,
          textStyle,
        ]}
      >
        {children as any}
      </Text>
    </Pressable>
  );
}

const makeStyles = (colors: any, spacing: any, radii: any) =>
  StyleSheet.create({
    base: {
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    fullWidth: { alignSelf: 'stretch' },
    size_sm: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 36 },
    size_md: { paddingVertical: 12, paddingHorizontal: 18, minHeight: 44 },
    size_lg: { paddingVertical: 14, paddingHorizontal: 20, minHeight: 52 },

    variant_primary: { backgroundColor: colors.primary },
    variant_secondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.text,
    },
    variant_ghost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    variant_danger: { backgroundColor: colors.danger },

    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.45 },

    labelBase: { fontWeight: '600' },
    labelSize_sm: { fontSize: 13 },
    labelSize_md: { fontSize: 15 },
    labelSize_lg: { fontSize: 16 },

    labelOnColor: { color: '#FFFFFF' },
    labelSecondary: { color: colors.text },
    labelGhost: { color: colors.text },
  });
