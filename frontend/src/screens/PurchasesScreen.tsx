import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl, Image, Pressable,
} from 'react-native';
import { listMyTransactions, confirmTransaction } from '../api/transactions';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { Card, Button, Skeleton } from '../components/ui';

const FILTERS = ['all', 'pending', 'approved', 'completed', 'rejected'] as const;
type Filter = typeof FILTERS[number];

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  pending:   { bg: '#FDF6EA', fg: '#B45309', label: 'Pending' },
  approved:  { bg: '#E8F1EA', fg: '#1E5631', label: 'Approved' },
  completed: { bg: '#E8F1EA', fg: '#1E5631', label: 'Completed' },
  rejected:  { bg: '#FEF2F2', fg: '#DC2626', label: 'Rejected' },
};

export default function PurchasesScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Filter>('all');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const limit = 20;
  const [hasMore, setHasMore] = useState(true);

  const fetch = useCallback(async (opts: { append?: boolean } = {}) => {
    const append = !!opts.append;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const offset = append ? offsetRef.current : 0;
      const data = await listMyTransactions({ role: 'buyer', status, limit, offset });
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

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.topTitle}>My Purchases</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((s) => (
          <Pressable
            key={s}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => { setStatusFilter(s); setRefreshing(true); }}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={{ padding: 16 }}>
          <Skeleton style={{ height: 140, borderRadius: 16, marginBottom: 12 }} />
          <Skeleton style={{ height: 140, borderRadius: 16, marginBottom: 12 }} />
          <Skeleton style={{ height: 140, borderRadius: 16 }} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetch({ append: false }); }}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!loadingMore && hasMore) fetch({ append: true }); }}
          renderItem={({ item }) => {
            const ghgDiscount = Number(item.ghg_discount ?? 0);
            const effectivePrice = Number(item.offered_price ?? 0) - ghgDiscount;
            const isBuyer = item.buyer_id === user?.id;
            const showConfirmButton = item.status === 'approved' && isBuyer && !item.buyer_confirmed;
            const waitingForOther = item.status === 'approved' && item.buyer_confirmed && !item.seller_confirmed;
            const statusStyle = STATUS_STYLES[item.status] || { bg: theme.colors.surfaceAlt, fg: theme.colors.muted, label: item.status };

            return (
              <Card padding="none" style={{ marginBottom: 12, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', padding: 12 }}>
                  {item.listing_image_url ? (
                    <Image source={{ uri: item.listing_image_url }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceAlt }]} />
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={styles.itemTitle} numberOfLines={2}>{item.listing_title ?? 'Listing'}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusStyle.fg }]}>{statusStyle.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.seller}>from {item.seller_email ?? 'seller'}</Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>You pay</Text>
                      <Text style={styles.priceValue}>${effectivePrice.toFixed(2)}</Text>
                    </View>
                    {ghgDiscount > 0 && (
                      <Text style={styles.ghgLine}>−${ghgDiscount.toFixed(2)} GHG discount applied</Text>
                    )}
                  </View>
                </View>

                {item.status === 'approved' && (
                  <View style={[styles.actionPanel, { backgroundColor: '#FDF6EA' }]}>
                    <Text style={[styles.actionTitle, { color: '#B45309' }]}>Awaiting confirmation</Text>
                    <Text style={styles.actionSub}>
                      {item.buyer_confirmed ? '✓' : '○'} You   ·   {item.seller_confirmed ? '✓' : '○'} Seller
                    </Text>
                    {showConfirmButton && (
                      <Button
                        size="md"
                        fullWidth
                        style={{ marginTop: 10 }}
                        disabled={confirmingId === item.id}
                        onPress={async () => {
                          setConfirmingId(item.id);
                          try {
                            await confirmTransaction(item.id);
                            Alert.alert('Confirmed', 'Your confirmation has been recorded.');
                            refreshUser();
                            fetch({ append: false });
                          } catch (err: any) {
                            Alert.alert('Error', err.message || 'Failed to confirm');
                          } finally {
                            setConfirmingId(null);
                          }
                        }}
                      >
                        {confirmingId === item.id ? 'Confirming…' : 'Confirm received'}
                      </Button>
                    )}
                    {waitingForOther && (
                      <Text style={styles.waitingText}>Waiting for seller to confirm…</Text>
                    )}
                  </View>
                )}

                {item.status === 'completed' && (
                  <View style={[styles.actionPanel, { backgroundColor: theme.colors.primarySoft }]}>
                    <Text style={[styles.actionTitle, { color: theme.colors.primary }]}>Transaction complete</Text>
                    <Text style={[styles.actionSub, { color: theme.colors.primaryDark }]}>
                      ${effectivePrice.toFixed(2)} transferred to seller
                    </Text>
                  </View>
                )}
              </Card>
            );
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={theme.colors.primary} /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>No purchases yet</Text>
              <Text style={{ fontSize: 14, color: theme.colors.muted, marginBottom: 16 }}>Find something pre-loved on the home tab.</Text>
              <Button onPress={() => navigation.navigate('Home')}>Browse listings</Button>
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

    thumb: { width: 74, height: 74, borderRadius: theme.radii.md },
    itemTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text, marginRight: 8 },
    seller: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8, gap: 8 },
    priceLabel: { fontSize: 12, color: theme.colors.muted },
    priceValue: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
    ghgLine: { fontSize: 12, color: theme.colors.primary, marginTop: 2 },

    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radii.pill },
    statusBadgeText: { fontSize: 11, fontWeight: '700' },

    actionPanel: { padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border },
    actionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
    actionSub: { fontSize: 12, color: theme.colors.muted },
    waitingText: { fontSize: 12, color: theme.colors.muted, marginTop: 6, fontStyle: 'italic' },
  });
