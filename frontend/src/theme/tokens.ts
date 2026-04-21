import { TextStyle, ViewStyle } from 'react-native';

const colors = {
  // Brand — pine green
  primary: '#1E5631',
  primaryDark: '#134423',
  primaryLight: '#2F7A44',
  primarySoft: '#E8F1EA',

  // Surfaces & text
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F8F6',
  text: '#111111',
  textSoft: '#374151',
  muted: '#6B7280',
  border: '#E8EAE4',

  // Feedback
  success: '#1E5631',
  successSoft: '#E8F1EA',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warning: '#B45309',
  warningSoft: '#FDF6EA',

  // GHG — aligns with brand
  ghg: '#1E5631',
  ghgSoft: '#E8F1EA',

  overlay: 'rgba(0,0,0,0.5)',
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
  xl: 20,
  pill: 999,
};

const typography: { [k: string]: TextStyle } = {
  h1: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  h3: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  bodyMuted: { fontSize: 15, lineHeight: 21, color: colors.muted },
  small: { fontSize: 12, color: colors.muted },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, color: colors.muted },
};

const elevation: { [k: string]: ViewStyle } = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
};

export default { colors, spacing, radii, typography, elevation };
