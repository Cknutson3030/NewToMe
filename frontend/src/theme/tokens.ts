import { TextStyle, ViewStyle } from 'react-native';

const colors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  muted: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
  danger: '#EF4444',
  overlay: 'rgba(0,0,0,0.5)'
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const radii = {
  sm: 6,
  md: 10,
  lg: 14,
};

const typography: { [k: string]: TextStyle } = {
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 12, color: colors.muted }
};

const elevation: { [k: string]: ViewStyle } = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  }
};

export default { colors, spacing, radii, typography, elevation };
