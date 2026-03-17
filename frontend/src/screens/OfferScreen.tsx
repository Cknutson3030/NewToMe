import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, Keyboard, Platform, TouchableWithoutFeedback } from 'react-native';
import { requestTransaction } from '../api/transactions';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/ui/Button';

export default function OfferScreen({ route, navigation }: { route: any; navigation: any }) {
  const { listingId, listingTitle, listingImage, listingPrice, listingLocation, listingCondition } = route.params || {};
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!price) return Alert.alert('Please enter an offer price');
    const parsed = Number(price);
    if (isNaN(parsed) || parsed < 0) return Alert.alert('Enter a valid non-negative number');
    setLoading(true);
    try {
      await requestTransaction(listingId, parsed, notes || undefined);
      Alert.alert('Success', 'Offer submitted to seller');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit offer');
    } finally {
      setLoading(false);
    }
  };
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 80}>
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.header, theme.typography.h2]}>Offer</Text>
            {listingImage ? <Image source={{ uri: listingImage }} style={styles.image} /> : null}
            <Text style={styles.title}>{listingTitle ?? 'Listing'}</Text>
            {listingPrice != null && (
              <Text style={[styles.label, { marginTop: 6 }]}>Original Price: ${Number(listingPrice).toFixed(2)}</Text>
            )}
            {listingCondition ? <Text style={[styles.label, { marginTop: 4 }]}>Condition: {listingCondition}</Text> : null}
            {listingLocation ? <Text style={[styles.label, { marginTop: 2 }]}>Location: {listingLocation}</Text> : null}
            <Text style={styles.label}>Your Offer (USD)</Text>
            <TextInput keyboardType="numeric" value={price} onChangeText={setPrice} style={styles.input} placeholder="Enter offer price" returnKeyType="done" />
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput value={notes} onChangeText={setNotes} style={[styles.input, { height: 90 }]} placeholder="Message to seller" multiline />
            <Button onPress={submit} style={{ marginTop: 16 }}>{loading ? 'Sending...' : 'Send Offer'}</Button>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  scrollContent: { padding: 16 },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  image: { width: '100%', height: 180, borderRadius: 8, marginBottom: 12, backgroundColor: '#E5E7EB' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  label: { fontWeight: '600', marginTop: 8, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', padding: 10, borderRadius: 8 },
  submit: { backgroundColor: '#2563EB', padding: 14, alignItems: 'center', borderRadius: 8, marginTop: 16 },
});
