import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, StyleSheet, Alert, Image,
  KeyboardAvoidingView, ScrollView, Keyboard, Platform, TouchableWithoutFeedback, Switch, Pressable,
} from 'react-native';
import { requestTransaction } from '../api/transactions';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function OfferScreen({ route, navigation }: { route: any; navigation: any }) {
  const { listingId, listingTitle, listingImage, listingPrice, listingLocation, listingCondition } = route.params || {};
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();

  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [useGhgDiscount, setUseGhgDiscount] = useState(false);
  const [ghgKgToUse, setGhgKgToUse] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { refreshUser(); }, []);

  const walletBalance = user?.wallet_balance ?? 0;
  const ghgBalance = user?.ghg_balance ?? 0;
  const maxGhgDollars = ghgBalance / 100;

  const offeredPrice = Number(price) || 0;
  const ghgDollars = useGhgDiscount
    ? Math.min(Number(ghgKgToUse || 0) / 100, maxGhgDollars, offeredPrice)
    : 0;
  const effectivePrice = Math.max(offeredPrice - ghgDollars, 0);
  const insufficientFunds = effectivePrice > walletBalance;

  const submit = async () => {
    if (!price) return Alert.alert('Please enter an offer price');
    const parsed = Number(price);
    if (isNaN(parsed) || parsed < 0) return Alert.alert('Enter a valid non-negative number');
    if (insufficientFunds) return Alert.alert('Insufficient Funds', 'Your wallet balance is too low for this offer.');
    setLoading(true);
    try {
      await requestTransaction(listingId, parsed, notes || undefined, ghgDollars > 0 ? ghgDollars : undefined);
      Alert.alert('Offer sent', 'Your offer has been sent to the seller.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit offer');
    } finally {
      setLoading(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.topTitle}>Make an offer</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card padding="md" variant="outlined" style={{ flexDirection: 'row', alignItems: 'center' }}>
              {listingImage ? (
                <Image source={{ uri: listingImage }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}><Text style={{ color: theme.colors.muted, fontSize: 11 }}>No image</Text></View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>{listingTitle ?? 'Listing'}</Text>
                {listingPrice != null && (
                  <Text style={styles.itemPrice}>Listed at ${Number(listingPrice).toFixed(2)}</Text>
                )}
                <View style={styles.metaRow}>
                  {listingCondition ? <Text style={styles.metaText}>{listingCondition}</Text> : null}
                  {listingLocation ? <Text style={styles.metaText}>· {listingLocation}</Text> : null}
                </View>
              </View>
            </Card>

            <View style={styles.walletRow}>
              <Text style={styles.walletLabel}>Wallet</Text>
              <Text style={[styles.walletValue, insufficientFunds && { color: theme.colors.danger }]}>
                ${walletBalance.toFixed(2)}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Your offer</Text>
            <View style={styles.priceInputWrap}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                keyboardType="numeric"
                value={price}
                onChangeText={setPrice}
                style={styles.priceInput}
                placeholder="0"
                placeholderTextColor={theme.colors.muted}
                returnKeyType="done"
              />
            </View>

            {ghgBalance > 0 && (
              <Card variant="outlined" padding="md" style={{ marginTop: 16 }}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>Use GHG credits</Text>
                    <Text style={styles.toggleSub}>
                      Available: {ghgBalance.toFixed(1)} kg · up to ${maxGhgDollars.toFixed(2)}
                    </Text>
                  </View>
                  <Switch
                    value={useGhgDiscount}
                    onValueChange={(v) => { setUseGhgDiscount(v); if (!v) setGhgKgToUse(''); }}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primaryLight }}
                    thumbColor={'#FFFFFF'}
                  />
                </View>
                {useGhgDiscount && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.smallLabel}>kg to redeem (100 kg = $1)</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={ghgKgToUse}
                      onChangeText={setGhgKgToUse}
                      style={styles.input}
                      placeholder={`Max ${ghgBalance.toFixed(0)} kg`}
                      placeholderTextColor={theme.colors.muted}
                      returnKeyType="done"
                    />
                    {ghgDollars > 0 && (
                      <Text style={styles.discountPreview}>
                        −${ghgDollars.toFixed(2)} discount
                      </Text>
                    )}
                  </View>
                )}
              </Card>
            )}

            {offeredPrice > 0 && (
              <Card padding="md" style={[styles.summaryCard, { backgroundColor: theme.colors.surfaceAlt }]}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Offer</Text>
                  <Text style={styles.summaryValue}>${offeredPrice.toFixed(2)}</Text>
                </View>
                {ghgDollars > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.colors.primary }]}>GHG discount</Text>
                    <Text style={[styles.summaryValue, { color: theme.colors.primary }]}>−${ghgDollars.toFixed(2)}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>You pay</Text>
                  <Text style={styles.totalValue}>${effectivePrice.toFixed(2)}</Text>
                </View>
              </Card>
            )}

            <Text style={styles.fieldLabel}>Note to seller (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              placeholder="Introduce yourself or ask a question…"
              placeholderTextColor={theme.colors.muted}
              multiline
            />

            {insufficientFunds && (
              <Text style={styles.insufficientText}>Offer exceeds your wallet balance.</Text>
            )}

            <Button
              size="lg"
              fullWidth
              onPress={submit}
              disabled={insufficientFunds || loading}
              style={{ marginTop: 20 }}
            >
              {loading ? 'Sending…' : 'Send offer'}
            </Button>
          </ScrollView>
        </TouchableWithoutFeedback>
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
    thumb: { width: 72, height: 72, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceAlt },
    thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    itemTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    itemPrice: { fontSize: 14, color: theme.colors.muted, marginTop: 4 },
    metaRow: { flexDirection: 'row', marginTop: 4 },
    metaText: { fontSize: 12, color: theme.colors.muted, marginRight: 4, textTransform: 'capitalize' },

    walletRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 18,
      marginBottom: 4,
    },
    walletLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    walletValue: { fontSize: 18, fontWeight: '700', color: theme.colors.text },

    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 16,
      marginBottom: 8,
    },
    priceInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 14,
    },
    dollar: { fontSize: 24, color: theme.colors.muted, fontWeight: '600' },
    priceInput: {
      flex: 1,
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.text,
      paddingVertical: 14,
      marginLeft: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.colors.text,
    },
    smallLabel: { fontSize: 12, color: theme.colors.muted, marginBottom: 6 },

    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    toggleSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
    discountPreview: { marginTop: 8, fontSize: 14, fontWeight: '700', color: theme.colors.primary },

    summaryCard: { marginTop: 16 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    summaryLabel: { fontSize: 14, color: theme.colors.textSoft },
    summaryValue: { fontSize: 14, color: theme.colors.textSoft, fontWeight: '500' },
    totalRow: { borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 6, paddingTop: 10 },
    totalLabel: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    totalValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },

    insufficientText: { fontSize: 13, color: theme.colors.danger, marginTop: 10, fontWeight: '600' },
  });
