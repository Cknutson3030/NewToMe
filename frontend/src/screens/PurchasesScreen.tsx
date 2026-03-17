import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, Alert, RefreshControl } from 'react-native';
import { listMyTransactions } from '../api/transactions';

export default function PurchasesScreen({ navigation }: { navigation: any }) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending'|'approved'|'rejected'|'all'>('all');
  const offsetRef = useRef(0);
  const limit = 20;
  const [hasMore, setHasMore] = useState(true);

  const fetch = useCallback(async (opts: { append?: boolean } = {}) => {
    const append = !!opts.append;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const role = 'buyer';
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const offset = append ? offsetRef.current : 0;
      const data = await listMyTransactions({ role, status, limit, offset });
      const rows = data || [];
      if (append) {
        setTransactions((prev) => [...prev, ...rows]);
        offsetRef.current = offsetRef.current + rows.length;
      } else {
        setTransactions(rows);
        offsetRef.current = rows.length;
      }
      setHasMore(rows.length === limit);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load purchases');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>My Purchases</Text>
      <View style={styles.filterRow}>
        {(['all','pending','approved','rejected'] as const).map(s => (
          <Pressable
            key={s}
            style={[styles.filterButton, statusFilter === s ? styles.filterActive : null]}
            onPress={() => setStatusFilter(s as any)}
          >
            <Text style={[styles.filterText, statusFilter === s ? { color: '#fff' } : {}]}>{s.charAt(0).toUpperCase()+s.slice(1)}</Text>
          </Pressable>
        ))}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator style={{marginTop:24}} />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch({ append: false }); }} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!loadingMore && hasMore) { fetch({ append: true }); } }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>Listing: {item.listing_id}</Text>
              <Text>Seller: {item.seller_id}</Text>
              <Text>Status: {item.status}</Text>
              <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 12 }} /> : null}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24 }}>No purchases found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { fontSize: 22, fontWeight: '700', padding: 16 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  filterButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
  filterActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  filterText: { color: '#111', fontWeight: '600' },
  card: { backgroundColor: '#fff', marginTop: 12, marginHorizontal: 16, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  title: { fontWeight: '700', marginBottom: 6 },
  time: { marginTop: 6, color: '#6B7280', fontSize: 12 },
});
