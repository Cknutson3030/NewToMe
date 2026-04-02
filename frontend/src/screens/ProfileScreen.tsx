import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/ui/Button';

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const { user, updateProfile } = useAuth();
  const { theme } = useTheme();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter a display name.');
      return;
    }
    setSaving(true);
    const { error } = await updateProfile(trimmed);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message || 'Failed to save profile.');
    } else {
      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.heading, theme.typography.h1]}>My Profile</Text>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.label, { color: theme.colors.muted }]}>Email</Text>
            <Text style={[styles.value, { color: '#111827' }]}>{user?.email}</Text>
          </View>

          <View style={[styles.card, styles.ghgCard]}>
            <Text style={styles.ghgLabel}>GHG Credits Earned</Text>
            <Text style={styles.ghgBalance}>{(user?.ghg_balance ?? 0).toFixed(1)} kg CO₂e</Text>
            <Text style={styles.ghgHint}>Earned by buying and selling secondhand instead of new or landfill.</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.label, { color: theme.colors.muted }]}>Display Name</Text>
            <Text style={[styles.hint, { color: theme.colors.muted }]}>
              This name is shown to others in messages instead of "Buyer" or "Seller".
            </Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.border, color: '#111827' }]}
              placeholder="Enter your name"
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={100}
              returnKeyType="done"
              autoCapitalize="words"
            />
          </View>

          <Button onPress={handleSave} style={styles.saveButton}>
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16 },
  heading: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 6,
  },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16 },
  hint: { fontSize: 13, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 4,
  },
  saveButton: { marginTop: 8 },
  ghgCard: {
    backgroundColor: '#F0FFF4',
    borderColor: '#6EE7B7',
  },
  ghgLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#047857',
  },
  ghgBalance: {
    fontSize: 28,
    fontWeight: '700',
    color: '#065F46',
  },
  ghgHint: {
    fontSize: 12,
    color: '#6B7280',
  },
});
