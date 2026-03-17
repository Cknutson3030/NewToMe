import React, { createContext, useContext, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import tokens from './tokens';

type Theme = typeof tokens;

const ThemeContext = createContext<{
  theme: Theme;
  mode: 'light' | 'dark';
  toggleMode: () => void;
}>({ theme: tokens, mode: 'light', toggleMode: () => {} });

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const toggleMode = () => setMode((m) => (m === 'light' ? 'dark' : 'light'));

  // In the future, merge dark overrides
  const theme = tokens;

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleMode }}>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>{children}</View>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

const styles = StyleSheet.create({ root: { flex: 1 } });

export default ThemeProvider;
