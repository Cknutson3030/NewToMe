import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { Card, Button } from '../components/ui';

export default function LoginScreen({ navigation, route }: { navigation: any; route: any }) {
  const { signIn } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (route?.params?.accountCreated) {
      Alert.alert('Success', 'Account created successfully');
      navigation.setParams({ accountCreated: undefined });
    }
  }, [navigation, route?.params?.accountCreated]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      const { error } = await signIn(email.trim(), password);
      if (error) {
        Alert.alert('Login Failed', error.message);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const styles = makeStyles(theme.colors);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerSection}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>N</Text>
          </View>
          <Text style={[styles.appName, { color: theme.colors.text }]}>NewToMe</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted }]}>Buy & sell pre-loved items</Text>
        </View>

        <Card variant="outlined" padding="lg" style={styles.formSection}>
          <Text style={[theme.typography.h2, { marginBottom: 16 }]}>Welcome back</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Your password"
            placeholderTextColor={theme.colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
          />

          <Button size="lg" fullWidth onPress={handleLogin} style={{ marginTop: 16 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Log In'}
          </Button>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.colors.muted }]}>New here? </Text>
            <Text onPress={() => navigation.navigate('SignUp')} style={[styles.linkText, { color: theme.colors.primary }]}>
              Create an account
            </Text>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    headerSection: { alignItems: 'center', marginBottom: 32 },
    logoMark: {
      width: 64,
      height: 64,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    logoMarkText: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
    appName: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    subtitle: { fontSize: 15, marginTop: 4 },
    formSection: { backgroundColor: colors.surface },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
      marginBottom: 6,
    },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
    footerText: { fontSize: 14 },
    linkText: { fontSize: 14, fontWeight: '700' },
  });
