import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { getGhgHistory } from '../api/transactions';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

interface GhgHistoryEntry {
  id: string;
  transaction_id: string;
  listing_title: string | null;
  role: 'buyer' | 'seller';
  kg_saved: number;
  created_at: string;
}

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const { user, updateProfile, refreshUser, signOut } = useAuth();
  const { theme } = useTheme();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ghgHistory, setGhgHistory] = useState<GhgHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => { refreshUser(); }, []);

  const loadGhgHistory = useCallback(async () => {
    if (ghgHistory.length > 0) return;
    setLoadingHistory(true);
    try {
      const data = await getGhgHistory({ limit: 50 });
      setGhgHistory(data);
    } catch { /* silent */ }
    setLoadingHistory(false);
  }, [ghgHistory.length]);

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) loadGhgHistory();
  };

  const handleSave = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) return Alert.alert('Required', 'Please enter a display name.');
    setSaving(true);
    const { error } = await updateProfile(trimmed);
    setSaving(false);
    if (error) Alert.alert('Error', error.message || 'Failed to save profile.');
    else Alert.alert('Saved', 'Your profile has been updated.');
  };

  const ghgBalance = user?.ghg_balance ?? 0;
  const walletBalance = user?.wallet_balance ?? 0;
  const redeemableDollars = ghgBalance / 100;

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.topTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.display_name || user?.email || '?')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={styles.name}>{user?.display_name || 'Set your name'}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>

          <View style={styles.balanceRow}>
            <Card padding="md" style={[styles.balanceCard, { backgroundColor: theme.colors.text }]}>
              <Text style={[styles.balanceLabel, { color: 'rgba(255,255,255,0.7)' }]}>Wallet</Text>
              <Text style={[styles.balanceValue, { color: '#FFFFFF' }]}>${walletBalance.toFixed(2)}</Text>
              <Text style={[styles.balanceHint, { color: 'rgba(255,255,255,0.55)' }]}>Demo balance</Text>
            </Card>
            <Card padding="md" style={[styles.balanceCard, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.balanceLabel, { color: 'rgba(255,255,255,0.8)' }]}>GHG saved</Text>
              <Text style={[styles.balanceValue, { color: '#FFFFFF' }]}>{ghgBalance.toFixed(1)} kg</Text>
              <Text style={[styles.balanceHint, { color: 'rgba(255,255,255,0.7)' }]}>
                ≈ ${redeemableDollars.toFixed(2)} off
              </Text>
            </Card>
          </View>

          <Card variant="outlined" padding="md" style={{ marginTop: 16 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>GHG History</Text>
              <TouchableOpacity onPress={toggleHistory}>
                <Text style={styles.link}>{showHistory ? 'Hide' : 'View'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionSub}>
              Credits earned by buying and selling secondhand. 100 kg = $1 discount.
            </Text>

            {showHistory && (
              <View style={{ marginTop: 12 }}>
                {loadingHistory && <ActivityIndicator size="small" color={theme.colors.primary} />}
                {!loadingHistory && ghgHistory.length === 0 && (
                  <Text style={styles.historyEmpty}>No history yet — complete a sale to earn credits.</Text>
                )}
                {ghgHistory.map((entry) => (
                  <View key={entry.id} style={styles.historyRow}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.historyTitle} numberOfLines={1}>
                        {entry.listing_title ?? 'Unknown item'}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {entry.role === 'buyer' ? 'Purchased' : 'Sold'} · {new Date(entry.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.historyKg}>+{Number(entry.kg_saved).toFixed(1)} kg</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card variant="outlined" padding="md" style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>Display name</Text>
            <Text style={styles.sectionSub}>Shown to others in messages instead of your email.</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={theme.colors.muted}
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={100}
              returnKeyType="done"
              autoCapitalize="words"
            />
            <Button fullWidth onPress={handleSave} style={{ marginTop: 12 }} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Card>

          <Button variant="ghost" fullWidth style={{ marginTop: 16 }} onPress={signOut}>
            Sign out
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    backArrow: { fontSize: 24, color: theme.colors.text },
    topTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    content: { padding: 20, paddingBottom: 40 },

    profileHeader: { alignItems: 'center', marginBottom: 20 },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    avatarText: { color: '#FFFFFF', fontSize: 32, fontWeight: '700' },
    name: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
    email: { fontSize: 14, color: theme.colors.muted, marginTop: 2 },

    balanceRow: { flexDirection: 'row', gap: 12 },
    balanceCard: { flex: 1 },
    balanceLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    balanceValue: { fontSize: 24, fontWeight: '800', marginTop: 6 },
    balanceHint: { fontSize: 12, marginTop: 2 },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    sectionSub: { fontSize: 13, color: theme.colors.muted, marginTop: 4 },
    link: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },

    historyEmpty: { fontSize: 13, color: theme.colors.muted, fontStyle: 'italic' },
    historyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    historyTitle: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
    historyMeta: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
    historyKg: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },

    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.colors.text,
      marginTop: 10,
    },
  });
