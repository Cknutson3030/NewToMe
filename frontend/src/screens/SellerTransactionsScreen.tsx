import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl, Image } from 'react-native';
import { listMyTransactions, respondTransaction } from '../api/transactions';
import { useTheme } from '../theme/ThemeProvider';
import { Card, Button, Skeleton } from '../components/ui';

export default function SellerTransactionsScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending'|'approved'|'rejected'|'all'>('pending');
  const offsetRef = useRef(0);
  const limit = 20;
  const [hasMore, setHasMore] = useState(true);

  const fetch = useCallback(async (opts: { append?: boolean } = {}) => {
    const append = !!opts.append;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const role = 'seller';
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
      Alert.alert('Error', err.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleAction = async (txnId: string, action: 'approved'|'rejected') => {
    try {
      await respondTransaction(txnId, action);
      Alert.alert('Success', `Transaction ${action}`);
      setTransactions((prev) => prev.filter(t => t.id !== txnId));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update transaction');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[theme.typography.h2, { padding: 16 }]}>Seller Transactions</Text>
      <View style={styles.filterRow}>
        {(['pending','approved','rejected','all'] as const).map(s => (
          <Button key={s} variant={statusFilter === s ? 'primary' : 'ghost'} style={{ marginRight: 8 }} onPress={() => { setStatusFilter(s as any); setRefreshing(true); fetch({ append: false }); }}>
            {s.charAt(0).toUpperCase()+s.slice(1)}
          </Button>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={{ padding: theme.spacing.md }}>
          <Skeleton style={{ height: 18, width: '50%' }} />
          <Skeleton style={{ height: 140, borderRadius: 10 }} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: theme.spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch({ append: false }); }} colors={[theme.colors.primary]} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!loadingMore && hasMore) { fetch({ append: true }); } }}
          renderItem={({ item }) => (
            <Card style={{ marginTop: theme.spacing.sm }}>
              {item.listing_image_url ? (
                <Image source={{ uri: item.listing_image_url }} style={{ width: '100%', height: 140, borderRadius: 8, marginBottom: 8 }} />
              ) : null}
              <Text style={[styles.title, theme.typography.body]}>{item.listing_title ?? `Listing: ${item.listing_id}`}</Text>
              <Text style={theme.typography.small}>Original: {item.listing_price != null ? `$${Number(item.listing_price).toFixed(2)}` : '—'}</Text>
              <Text style={theme.typography.small}>Offer: {item.offered_price != null ? `$${Number(item.offered_price).toFixed(2)}` : '—'}</Text>
              <Text style={theme.typography.small}>Buyer: {item.buyer_email ?? item.buyer_id}</Text>
              <Text style={theme.typography.small}>Status: {item.status}</Text>
              <Text style={[styles.time, theme.typography.small]}>{new Date(item.created_at).toLocaleString()}</Text>
              {item.status === 'pending' && (
                <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm }}>
                  <Button style={{ marginRight: 8 }} onPress={() => handleAction(item.id, 'approved')}>Approve</Button>
                  <Button variant="ghost" onPress={() => handleAction(item.id, 'rejected')}>Reject</Button>
                </View>
              )}
            </Card>
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: theme.spacing.md }} color={theme.colors.primary} /> : null}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24, color: theme.colors.muted }}>No transactions found.</Text>}
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
  approveButton: { backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  rejectButton: { backgroundColor: '#EF4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
});
