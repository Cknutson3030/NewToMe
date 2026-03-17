import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyListings } from '../api/listings';
import { listMyTransactions, respondTransaction } from '../api/transactions';

export default function MyListingsScreen({ navigation }: { navigation: any }) {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyListings = useCallback(async () => {
    try {
      const res = await getMyListings();
      const data = Array.isArray(res) ? res : res.data || [];
      setListings(data);
      // also fetch pending transactions where current user is seller
      try {
        const txns = await listMyTransactions({ role: 'seller', status: 'pending' });
        // group transactions by listing_id
        const byListing: Record<string, any[]> = {};
        (txns || []).forEach((t: any) => {
          const lid = String(t.listing_id);
          if (!byListing[lid]) byListing[lid] = [];
          byListing[lid].push(t);
        });
        // attach pending_transactions to matching listings
        setListings((prev) => prev.map((l: any) => ({ ...l, pending_transactions: byListing[String(l.id)] || [] })));
      } catch (err) {
        // ignore transaction fetch errors for now
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch your listings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={styles.loader} />
      ) : (
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
                  <Pressable
                    style={styles.editButton}
                    onPress={() => navigation.navigate('EditListing', { listing: item })}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>

                  {/* Pending transactions for this listing (if any) */}
                  {(item.pending_transactions || []).length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontWeight: '700', marginBottom: 6 }}>Pending Requests</Text>
                      {(item.pending_transactions || []).map((t: any) => (
                        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14 }}>Buyer: {t.buyer_id}</Text>
                            <Text style={{ fontSize: 12, color: '#6B7280' }}>{new Date(t.created_at).toLocaleString()}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable
                              style={[styles.approveButton]}
                              onPress={async () => {
                                try {
                                  await respondTransaction(t.id, 'approved');
                                  Alert.alert('Success', 'Transaction approved');
                                  // update local state: remove txn and mark listing sold
                                  setListings((prev) => prev.map((l: any) => l.id === item.id ? { ...l, status: 'sold', pending_transactions: (l.pending_transactions || []).filter((pt: any) => pt.id !== t.id) } : l));
                                } catch (err: any) {
                                  Alert.alert('Error', err.message || 'Failed to approve');
                                }
                              }}
                            >
                              <Text style={{ color: '#fff', fontWeight: '700' }}>Approve</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.rejectButton]}
                              onPress={async () => {
                                try {
                                  await respondTransaction(t.id, 'rejected');
                                  Alert.alert('Success', 'Transaction rejected');
                                  setListings((prev) => prev.map((l: any) => l.id === item.id ? { ...l, pending_transactions: (l.pending_transactions || []).filter((pt: any) => pt.id !== t.id) } : l));
                                } catch (err: any) {
                                  Alert.alert('Error', err.message || 'Failed to reject');
                                }
                              }}
                            >
                              <Text style={{ color: '#fff', fontWeight: '700' }}>Reject</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>You haven't listed anything yet.</Text>
              <Pressable
                style={styles.createButton}
                onPress={() => navigation.navigate('CreateListing')}
              >
                <Text style={styles.createButtonText}>Create Your First Listing</Text>
              </Pressable>
            </View>
          }
        />
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
