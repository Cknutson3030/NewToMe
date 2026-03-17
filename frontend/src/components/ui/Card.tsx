import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export default function Card({ children, style, ...rest }: ViewProps) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  return (
    <View accessibilityRole="article" style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.elevation.card,
    },
  });
