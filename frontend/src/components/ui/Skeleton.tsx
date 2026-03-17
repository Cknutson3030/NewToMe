import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export default function Skeleton({ style }: { style?: any }) {
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[{ backgroundColor: theme.colors.border, borderRadius: 8, opacity: anim }, styles.base, style]}
    />
  );
}

const styles = StyleSheet.create({ base: { height: 12, marginVertical: 6 } });
