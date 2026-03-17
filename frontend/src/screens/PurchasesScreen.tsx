import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, Alert, RefreshControl, Image } from 'react-native';
import { listMyTransactions } from '../api/transactions';
import { useTheme } from '../theme/ThemeProvider';
import { Card, Button, Skeleton } from '../components/ui';

export default function PurchasesScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.header, theme.typography.h2]}>My Purchases</Text>
      <View style={styles.filterRow}>
        {(['all','pending','approved','rejected'] as const).map(s => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityState={{ selected: statusFilter === s }}
            style={[
              styles.filterButton,
              statusFilter === s ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary } : { backgroundColor: theme.colors.surface }
            ]}
            onPress={() => { setStatusFilter(s as any); setRefreshing(true); fetch({ append: false }); }}
          >
            <Text style={[styles.filterText, statusFilter === s ? { color: '#fff' } : {}]}>{s.charAt(0).toUpperCase()+s.slice(1)}</Text>
          </Pressable>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={{ padding: theme.spacing.md }}>
          <Skeleton style={{ height: 18, width: '60%' }} />
          <Skeleton style={{ height: 140, borderRadius: 10 }} />
          <Skeleton style={{ height: 14, width: '40%' }} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: theme.spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch({ append: false }); }} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!loadingMore && hasMore) { fetch({ append: true }); } }}
          renderItem={({ item }) => (
            <Card style={{ marginTop: theme.spacing.sm }}>
              {item.listing_image_url ? (
                <Image accessibilityRole="image" accessibilityLabel={`Image for ${item.listing_title ?? 'listing'}`} source={{ uri: item.listing_image_url }} style={{ width: '100%', height: 140, borderRadius: 8, marginBottom: 8 }} />
              ) : null}
              <Text style={[{ fontWeight: '700', marginBottom: 6 }, theme.typography.body]}>{item.listing_title ?? `Listing: ${item.listing_id}`}</Text>
              <Text style={theme.typography.small}>Original: {item.listing_price != null ? `$${Number(item.listing_price).toFixed(2)}` : '—'}</Text>
              <Text style={theme.typography.small}>Offer: {item.offered_price != null ? `$${Number(item.offered_price).toFixed(2)}` : '—'}</Text>
              <Text style={theme.typography.small}>Seller: {item.seller_email ?? item.seller_id}</Text>
              <Text style={theme.typography.small}>Status: {item.status}</Text>
              <View style={{ marginTop: theme.spacing.sm, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[theme.typography.small, { color: theme.colors.muted }]}>{new Date(item.created_at).toLocaleString()}</Text>
                <Button accessibilityLabel="View transaction details" onPress={() => navigation.navigate('Offer', { tx: item })}>
                  View
                </Button>
              </View>
            </Card>
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: theme.spacing.md }} color={theme.colors.primary} /> : null}
          ListEmptyComponent={(
            <View style={{ alignItems: 'center', marginTop: 24 }}>
              <Text style={{ marginBottom: 12 }}>No purchases found.</Text>
              <Button accessibilityLabel="Browse listings" onPress={() => navigation.navigate('Home')}>Browse Listings</Button>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  filterButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, marginRight: 8 },
  filterText: { color: '#111', fontWeight: '600' },
});
