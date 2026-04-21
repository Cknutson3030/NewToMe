import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export default function Skeleton({ style }: { style?: any }) {
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[
        { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.md, opacity: anim },
        styles.base,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({ base: { height: 14, marginVertical: 6 } });
