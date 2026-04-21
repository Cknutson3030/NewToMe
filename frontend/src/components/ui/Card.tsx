import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type Props = ViewProps & {
  variant?: 'default' | 'flat' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

export default function Card({
  children,
  style,
  variant = 'default',
  padding = 'md',
  ...rest
}: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <View
      style={[
        styles.base,
        styles[`variant_${variant}` as const],
        styles[`padding_${padding}` as const],
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    base: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
    },
    variant_default: { ...theme.elevation.card },
    variant_flat: { backgroundColor: theme.colors.surfaceAlt },
    variant_outlined: {
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    padding_none: { padding: 0 },
    padding_sm: { padding: theme.spacing.sm },
    padding_md: { padding: theme.spacing.md },
    padding_lg: { padding: theme.spacing.lg },
  });
