import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyListings } from '../api/listings';
import { listMyTransactions, respondTransaction } from '../api/transactions';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/ui/Button';

export default function MyListingsScreen({ navigation }: { navigation: any }) {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending'|'active'|'approved'|'rejected'|'sold'|'approved_sold'>('pending');
  const { theme } = useTheme();

  const fetchMyListings = useCallback(async () => {
    try {
      const res = await getMyListings();
      const data = Array.isArray(res) ? res : res.data || [];

      const transactionStatuses = ['pending','approved','rejected'];
      const listingStatuses = ['active','sold'];

      // Special handling for combined Approved/Sold filter
      if (statusFilter === 'approved_sold') {
        try {
          const txns = await listMyTransactions({ role: 'seller', status: 'approved' });
          const byListing: Record<string, any[]> = {};
          (txns || []).forEach((t: any) => {
            const lid = String(t.listing_id);
            if (!byListing[lid]) byListing[lid] = [];
            byListing[lid].push(t);
          });
          // include listings that are sold or have an approved txn, and attach the approved txn as final_transaction
          const withFinal = data
            .filter((l: any) => String(l.status) === 'sold' || (byListing[String(l.id)] || []).length > 0)
            .map((l: any) => ({
              ...l,
              pending_transactions: byListing[String(l.id)] || [],
              final_transaction: (byListing[String(l.id)] || []).find((t: any) => t.status === 'approved') || (byListing[String(l.id)] || [])[0] || null,
            }));
          setListings(withFinal);
        } catch (err) {
          setListings(data.filter((l: any) => String(l.status) === 'sold'));
        }

      } else if (transactionStatuses.includes(statusFilter)) {
        try {
          const txns = await listMyTransactions({ role: 'seller', status: statusFilter });
          const byListing: Record<string, any[]> = {};
          (txns || []).forEach((t: any) => {
            const lid = String(t.listing_id);
            if (!byListing[lid]) byListing[lid] = [];
            byListing[lid].push(t);
          });
          // attach transactions and only include listings that have matching txns
          const withTxns = data
            .map((l: any) => ({ ...l, pending_transactions: byListing[String(l.id)] || [] }))
            .filter((l: any) => (l.pending_transactions || []).length > 0);
          setListings(withTxns);
        } catch (err) {
          // ignore transaction fetch errors for now
          setListings(data);
        }
      } else if (listingStatuses.includes(statusFilter)) {
        // filter listings by listing.status (e.g., active, sold)
        setListings(data.filter((l: any) => String(l.status) === statusFilter));
      } else {
        // default — show all listings
        setListings(data);
      }

    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch your listings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchMyListings();
  }, [fetchMyListings]);

  // Refresh when coming back from EditListing
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchMyListings();
    });
    return unsubscribe;
  }, [navigation, fetchMyListings]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyListings();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(['pending','active','approved_sold','rejected'] as const).map(s => (
              <Button key={s} variant={statusFilter === s ? 'primary' : 'ghost'} style={{ marginRight: 8 }} onPress={() => { setStatusFilter(s as any); setRefreshing(true); fetchMyListings(); }}>
                {s === 'approved_sold' ? 'Approved/Sold' : (s.charAt(0).toUpperCase()+s.slice(1))}
              </Button>
            ))}
          </ScrollView>
          <FlatList
          data={listings}
          keyExtractor={(item, index) => String(item?.id ?? index)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
          }
          renderItem={({ item }) => {
            const firstImage = item.listing_images
              ?.sort((a: any, b: any) => a.sort_order - b.sort_order)?.[0];
            const finalTxn = item.final_transaction || (item.pending_transactions || []).find((t: any) => t.status === 'approved');
            const showApprovedSoldView = statusFilter === 'approved_sold';

            return (
              <View style={styles.card}>
                {firstImage?.image_url && (
                  <Image
                    source={{ uri: firstImage.image_url }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.description ? (
                    <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                  <View style={styles.row}>
                    {item.price != null && (
                      <Text style={styles.price}>${item.price}</Text>
                    )}
                    <Text style={styles.status}>{item.status}</Text>
                  </View>

                  {showApprovedSoldView && (
                    <View style={{ marginTop: 8 }}>
                      {finalTxn ? (
                        <>
                          <Text style={{ fontWeight: '700' }}>Final Deal</Text>
                          <Text>Final Price: {finalTxn.offered_price != null ? `$${Number(finalTxn.offered_price).toFixed(2)}` : '—'}</Text>
                          <Text>Buyer: {finalTxn.buyer_email ?? finalTxn.buyer_id}</Text>
                        </>
                      ) : (
                        <Text style={{ color: '#6B7280' }}>No final transaction found.</Text>
                      )}

                      {/* show images thumbnails if available */}
                      {item.listing_images && item.listing_images.length > 0 && (
                        <View style={{ flexDirection: 'row', marginTop: 8 }}>
                          {item.listing_images.slice(0,3).map((img: any, idx: number) => (
                            <Image key={idx} source={{ uri: img.image_url }} style={{ width: 64, height: 64, borderRadius: 6, marginRight: 8 }} />
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                  {(() => {
                    const listingFinal = item && ['approved','rejected','sold'].includes(String(item.status));
                    const hideEdit = statusFilter === 'approved_sold' || listingFinal;
                    return !hideEdit ? (
                      <Button variant="ghost" onPress={() => navigation.navigate('EditListing', { listing: item })}>Edit</Button>
                    ) : null;
                  })()}

                  {/* Pending transactions for this listing (if any) */}
                  {(item.pending_transactions || []).length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontWeight: '700', marginBottom: 6 }}>Requests</Text>
                      {(item.pending_transactions || []).filter((t: any) => {
                        // when showing approved_sold view, exclude the final transaction from the requests list
                        if (statusFilter === 'approved_sold' && (item.final_transaction && t.id === item.final_transaction.id)) return false;
                        return true;
                      }).map((t: any) => {
                        const txnFinal = t.status && t.status !== 'pending';
                        const listingFinal = item && ['approved','rejected','sold'].includes(String(item.status));

                        // In approved_sold view we've already shown final transaction above, avoid duplicating it
                        if (statusFilter === 'approved_sold' && (txnFinal || listingFinal)) {
                          return null;
                        }

                        // still pending: allow approve/reject
                        if (!txnFinal) {
                          return (
                            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14 }}>Buyer: {t.buyer_email ?? t.buyer_id}</Text>
                                <Text style={{ fontSize: 13 }}>Offer: {t.offered_price != null ? `$${Number(t.offered_price).toFixed(2)}` : '—'}</Text>
                                {t.notes ? <Text style={{ fontSize: 12, color: '#374151' }}>{t.notes}</Text> : null}
                                <Text style={{ fontSize: 12, color: '#6B7280' }}>{new Date(t.created_at).toLocaleString()}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <Button style={{ marginRight: 8 }} onPress={async () => {
                                    try {
                                      await respondTransaction(t.id, 'approved');
                                      Alert.alert('Success', 'Transaction approved');
                                      setListings((prev) => prev.map((l: any) => l.id === item.id ? { ...l, status: 'sold', pending_transactions: (l.pending_transactions || []).filter((pt: any) => pt.id !== t.id) } : l));
                                    } catch (err: any) {
                                      Alert.alert('Error', err.message || 'Failed to approve');
                                    }
                                  }}>Approve</Button>
                                <Button variant="ghost" onPress={async () => {
                                  try {
                                    await respondTransaction(t.id, 'rejected');
                                    Alert.alert('Success', 'Transaction rejected');
                                    setListings((prev) => prev.map((l: any) => l.id === item.id ? { ...l, pending_transactions: (l.pending_transactions || []).filter((pt: any) => pt.id !== t.id) } : l));
                                  } catch (err: any) {
                                    Alert.alert('Error', err.message || 'Failed to reject');
                                  }
                                }}>Reject</Button>
                              </View>
                            </View>
                          );
                        }

                        // For non-pending transactions (shouldn't appear here normally), show a concise final line
                        return (
                          <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14 }}>Buyer: {t.buyer_email ?? t.buyer_id}</Text>
                              <Text style={{ fontSize: 13 }}>Offer: {t.offered_price != null ? `$${Number(t.offered_price).toFixed(2)}` : '—'}</Text>
                              <Text style={{ fontSize: 12, color: '#6B7280' }}>{t.status}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>You haven't listed anything yet.</Text>
              <Button onPress={() => navigation.navigate('CreateListing')} style={styles.createButton}>Create Your First Listing</Button>
            </View>
          }
        />
          </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FA' },
  loader: { flex: 1, justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  image: {
    width: '100%',
    height: 160,
    backgroundColor: '#E5E7EB',
  },
  cardBody: { padding: 14 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  desc: { fontSize: 14, color: '#6B7280', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  price: { fontSize: 16, fontWeight: '700', color: '#059669' },
  status: { fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'capitalize' },
  editButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  editButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  approveButton: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 },
  rejectButton: { backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: '#9CA3AF', marginBottom: 16 },
  createButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  createButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
