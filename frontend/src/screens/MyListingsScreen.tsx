import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Image, RefreshControl, Alert, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyListings } from '../api/listings';
import { listMyTransactions, respondTransaction, confirmTransaction } from '../api/transactions';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { Card, Button, Skeleton } from '../components/ui';

const FILTERS = ['pending', 'active', 'approved_sold', 'rejected'] as const;
type Filter = typeof FILTERS[number];

const FILTER_LABELS: Record<Filter, string> = {
  pending: 'Offers',
  active: 'Active',
  approved_sold: 'Sold',
  rejected: 'Rejected',
};

export default function MyListingsScreen({ navigation }: { navigation: any }) {
  const { refreshUser } = useAuth();
  const { theme } = useTheme();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Filter>('active');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const fetchMyListings = useCallback(async () => {
    try {
      const res = await getMyListings();
      const data = Array.isArray(res) ? res : res.data || [];
      const transactionStatuses = ['pending', 'approved', 'rejected'];
      const listingStatuses = ['active', 'sold'];

      if (statusFilter === 'approved_sold') {
        try {
          const txns = await listMyTransactions({ role: 'seller', status: 'approved' });
          const byListing: Record<string, any[]> = {};
          (txns || []).forEach((t: any) => {
            const lid = String(t.listing_id);
            (byListing[lid] ||= []).push(t);
          });
          const withFinal = data
            .filter((l: any) => String(l.status) === 'sold' || (byListing[String(l.id)] || []).length > 0)
            .map((l: any) => ({
              ...l,
              pending_transactions: byListing[String(l.id)] || [],
              final_transaction: (byListing[String(l.id)] || []).find((t: any) => t.status === 'approved') || (byListing[String(l.id)] || [])[0] || null,
            }));
          setListings(withFinal);
        } catch {
          setListings(data.filter((l: any) => String(l.status) === 'sold'));
        }
      } else if (transactionStatuses.includes(statusFilter)) {
        try {
          const txns = await listMyTransactions({ role: 'seller', status: statusFilter });
          const byListing: Record<string, any[]> = {};
          (txns || []).forEach((t: any) => {
            const lid = String(t.listing_id);
            (byListing[lid] ||= []).push(t);
          });
          const withTxns = data
            .map((l: any) => ({ ...l, pending_transactions: byListing[String(l.id)] || [] }))
            .filter((l: any) => (l.pending_transactions || []).length > 0);
          setListings(withTxns);
        } catch {
          setListings(data);
        }
      } else if (listingStatuses.includes(statusFilter)) {
        setListings(data.filter((l: any) => String(l.status) === statusFilter));
      } else {
        setListings(data);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch your listings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchMyListings(); }, [fetchMyListings]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => fetchMyListings());
    return unsubscribe;
  }, [navigation, fetchMyListings]);

  const onRefresh = () => { setRefreshing(true); fetchMyListings(); };

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.topTitle}>My Listings</Text>
        <Pressable onPress={() => navigation.navigate('CreateListing')} hitSlop={10}>
          <Text style={styles.plusText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((s) => (
          <Pressable
            key={s}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {FILTER_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={{ padding: 16 }}>
          <Skeleton style={{ height: 140, borderRadius: 16, marginBottom: 12 }} />
          <Skeleton style={{ height: 140, borderRadius: 16, marginBottom: 12 }} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item, idx) => String(item?.id ?? idx)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          renderItem={({ item }) => {
            const firstImage = item.listing_images?.sort?.((a: any, b: any) => a.sort_order - b.sort_order)?.[0];
            const finalTxn = item.final_transaction || (item.pending_transactions || []).find((t: any) => t.status === 'approved');
            const isApprovedSold = statusFilter === 'approved_sold';

            return (
              <Card padding="none" style={{ marginBottom: 12, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', padding: 12 }}>
                  {firstImage?.image_url ? (
                    <Image source={{ uri: firstImage.image_url }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceAlt }]} />
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.price}>${item.price}</Text>
                    </View>
                    <Text style={styles.status}>{item.status}</Text>
                    {!isApprovedSold && !['approved', 'rejected', 'sold'].includes(String(item.status)) && (
                      <Pressable onPress={() => navigation.navigate('EditListing', { listing: item })} style={{ marginTop: 6 }}>
                        <Text style={styles.editLink}>Edit listing →</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {isApprovedSold && finalTxn && (
                  <View style={styles.panel}>
                    <View style={styles.panelRow}>
                      <Text style={styles.panelLabel}>Buyer</Text>
                      <Text style={styles.panelValue}>{finalTxn.buyer_email ?? '—'}</Text>
                    </View>
                    <View style={styles.panelRow}>
                      <Text style={styles.panelLabel}>Final price</Text>
                      <Text style={styles.panelValue}>${Number(finalTxn.offered_price ?? 0).toFixed(2)}</Text>
                    </View>
                    {Number(finalTxn.ghg_discount ?? 0) > 0 && (
                      <View style={styles.panelRow}>
                        <Text style={[styles.panelLabel, { color: theme.colors.primary }]}>GHG discount</Text>
                        <Text style={[styles.panelValue, { color: theme.colors.primary }]}>−${Number(finalTxn.ghg_discount).toFixed(2)}</Text>
                      </View>
                    )}

                    {finalTxn.status === 'approved' && (
                      <View style={[styles.dualConfirmBox, { backgroundColor: '#FDF6EA' }]}>
                        <Text style={[styles.actionTitle, { color: '#B45309' }]}>Awaiting confirmation</Text>
                        <Text style={styles.actionSub}>
                          {finalTxn.buyer_confirmed ? '✓' : '○'} Buyer   ·   {finalTxn.seller_confirmed ? '✓' : '○'} You
                        </Text>
                        {!finalTxn.seller_confirmed && (
                          <Button
                            size="md"
                            fullWidth
                            style={{ marginTop: 10 }}
                            disabled={confirmingId === finalTxn.id}
                            onPress={async () => {
                              setConfirmingId(finalTxn.id);
                              try {
                                await confirmTransaction(finalTxn.id);
                                Alert.alert('Confirmed', 'Your confirmation has been recorded.');
                                refreshUser();
                                fetchMyListings();
                              } catch (err: any) {
                                Alert.alert('Error', err.message || 'Failed to confirm');
                              } finally {
                                setConfirmingId(null);
                              }
                            }}
                          >
                            {confirmingId === finalTxn.id ? 'Confirming…' : 'Confirm sold'}
                          </Button>
                        )}
                        {finalTxn.seller_confirmed && !finalTxn.buyer_confirmed && (
                          <Text style={styles.waitingText}>Waiting for buyer to confirm…</Text>
                        )}
                      </View>
                    )}

                    {finalTxn.status === 'completed' && (
                      <View style={[styles.dualConfirmBox, { backgroundColor: theme.colors.primarySoft }]}>
                        <Text style={[styles.actionTitle, { color: theme.colors.primary }]}>Sale complete</Text>
                      </View>
                    )}
                  </View>
                )}

                {!isApprovedSold && (item.pending_transactions || []).length > 0 && (
                  <View style={styles.panel}>
                    <Text style={styles.offersHeader}>
                      {(item.pending_transactions || []).length} offer{(item.pending_transactions || []).length > 1 ? 's' : ''}
                    </Text>
                    {(item.pending_transactions || []).map((t: any) => {
                      if (t.status && t.status !== 'pending') return null;
                      return (
                        <View key={t.id} style={styles.offerRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.offerBuyer} numberOfLines={1}>{t.buyer_email ?? 'Buyer'}</Text>
                            <Text style={styles.offerPrice}>${Number(t.offered_price ?? 0).toFixed(2)}</Text>
                            {t.notes ? <Text style={styles.offerNote} numberOfLines={2}>{t.notes}</Text> : null}
                          </View>
                          <View style={{ gap: 6 }}>
                            <Button
                              size="sm"
                              onPress={async () => {
                                try {
                                  await respondTransaction(t.id, 'approved');
                                  Alert.alert('Approved', 'Offer accepted');
                                  fetchMyListings();
                                } catch (err: any) {
                                  Alert.alert('Error', err.message || 'Failed');
                                }
                              }}
                            >Accept</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={async () => {
                                try {
                                  await respondTransaction(t.id, 'rejected');
                                  fetchMyListings();
                                } catch (err: any) {
                                  Alert.alert('Error', err.message || 'Failed');
                                }
                              }}
                            >Decline</Button>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>Nothing here</Text>
              <Text style={{ fontSize: 14, color: theme.colors.muted, marginBottom: 16 }}>Create a listing to start selling.</Text>
              <Button onPress={() => navigation.navigate('CreateListing')}>Create listing</Button>
            </View>
          }
        />
      )}
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
    plusText: { fontSize: 28, color: theme.colors.primary, fontWeight: '300' },

    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
      flexWrap: 'wrap',
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceAlt,
    },
    filterChipActive: { backgroundColor: theme.colors.text },
    filterChipText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
    filterChipTextActive: { color: '#FFFFFF' },

    thumb: { width: 78, height: 78, borderRadius: theme.radii.md },
    itemTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text, marginRight: 8 },
    price: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
    status: { fontSize: 12, color: theme.colors.muted, textTransform: 'capitalize', marginTop: 2 },
    editLink: { fontSize: 13, color: theme.colors.primary, fontWeight: '600' },

    panel: { borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 12 },
    panelRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    panelLabel: { fontSize: 13, color: theme.colors.muted },
    panelValue: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },

    dualConfirmBox: { marginTop: 10, padding: 12, borderRadius: theme.radii.md },
    actionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
    actionSub: { fontSize: 12, color: theme.colors.muted },
    waitingText: { fontSize: 12, color: theme.colors.muted, marginTop: 6, fontStyle: 'italic' },

    offersHeader: { fontSize: 12, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    offerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    offerBuyer: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
    offerPrice: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    offerNote: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  });
