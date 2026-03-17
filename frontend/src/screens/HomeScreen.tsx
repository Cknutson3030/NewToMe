import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Button, ActivityIndicator, Image, RefreshControl, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getListings } from '../api/listings';
import { getOrCreateConversation } from '../api/chat';
import { requestTransaction } from '../api/transactions';
import { useAuth } from '../contexts/AuthContext';


export default function HomeScreen({ navigation }: { navigation: any }) {
  const { signOut, user } = useAuth();
  const [messagingListingId, setMessagingListingId] = useState<string | null>(null);

  const handleMessageSeller = useCallback(async (listingId: string) => {
    setMessagingListingId(listingId);
    try {
      const conversation = await getOrCreateConversation(listingId);
      navigation.navigate('Chat', { conversation });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not open conversation');
    } finally {
      setMessagingListingId(null);
    }
  }, [navigation]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // filters
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [itemCondition, setItemCondition] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [sortBy, setSortBy] = useState<'created_at'|'price'|'title'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc'|'desc'>('desc');
  const [limit, setLimit] = useState<string>(''); // keep as string so editing doesn't coerce to number
  const [offset, setOffset] = useState<number>(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef<any>(null);

  // Fetch listings on component mount
  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async (params?: Record<string, any>, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const p: Record<string, any> = { ...(params || {}) };
      if (limit !== '' && limit !== null && limit !== undefined) p.limit = Number(limit);
      p.offset = append ? offset : 0;
      p.sort_by = sortBy;
      p.sort_order = sortOrder;

      const res = await getListings(p);
      const allData = Array.isArray(res) ? res : res.data || [];
      // Exclude current user's own listings (they appear in My Listings)
      const data = user?.id ? allData.filter((item: any) => item.owner_user_id !== user.id) : allData;

      if (append) {
        setListings((prev: any[]) => [...prev, ...data]);
        setOffset((prev) => prev + data.length);
      } else {
        setListings(data);
        setOffset(data.length);
      }

      setHasMore(data.length === (Number(limit) || 20));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch listings');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setOffset(0);
      const params: Record<string, any> = {};
      if (q) params.q = q;
      if (category) params.category = category;
      if (minPrice) params.min_price = minPrice;
      if (maxPrice) params.max_price = maxPrice;
      if (itemCondition) params.item_condition = itemCondition;
      if (locationCity) params.location_city = locationCity;
      params.sort_by = sortBy;
      params.sort_order = sortOrder;
      const res = await getListings(params);
      const allData = Array.isArray(res) ? res : res.data || [];
      const data = user?.id ? allData.filter((item: any) => item.owner_user_id !== user.id) : allData;
      setListings(data);
      setOffset(data.length);
      setHasMore(data.length === (Number(limit) || 20));
    } catch (err) {
      Alert.alert('Error', 'Failed to refresh listings');
    } finally {
      setRefreshing(false);
    }
  }, [q, category, minPrice, maxPrice, itemCondition, locationCity, sortBy, sortOrder, limit]);

  // debounce filters
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params: Record<string, any> = {};
      if (q) params.q = q;
      if (category) params.category = category;
      if (minPrice) params.min_price = minPrice;
      if (maxPrice) params.max_price = maxPrice;
      if (itemCondition) params.item_condition = itemCondition;
      if (locationCity) params.location_city = locationCity;
      params.sort_by = sortBy;
      params.sort_order = sortOrder;
      fetchListings(params, false);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, category, minPrice, maxPrice, itemCondition, locationCity, sortBy, sortOrder, limit]);

  // Request-to-buy state
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const handleRequestBuy = async (listingId: string, listingTitle?: string, listingImage?: string) => {
    // Navigate to Offer screen where buyer can enter offered price
    navigation.navigate('Offer', { listingId, listingTitle, listingImage });
  };

  // Render UI
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 80}>
      <View style={styles.header}>
        <Text style={styles.title}>Listings</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', flex: 1, marginLeft: 8 }}>
          <Pressable style={styles.createButton} onPress={() => navigation.navigate('Conversations')}>
            <Text style={styles.createButtonText}>Messages</Text>
          </Pressable>
          <Pressable style={styles.createButton} onPress={() => navigation.navigate('MyListings')}>
            <Text style={styles.createButtonText}>My Listings</Text>
          </Pressable>
          <Pressable style={styles.createButton} onPress={() => navigation.navigate('Purchases')}>
            <Text style={styles.createButtonText}>Purchases</Text>
          </Pressable>
          <Pressable style={styles.createButton} onPress={() => navigation.navigate('SellerTransactions')}>
            <Text style={styles.createButtonText}>Sales</Text>
          </Pressable>
          <Pressable style={styles.createButton} onPress={() => navigation.navigate('CreateListing')}>
            <Text style={styles.createButtonText}>+ New</Text>
          </Pressable>
          <Pressable style={[styles.createButton, { backgroundColor: '#6B7280' }]} onPress={signOut}>
            <Text style={styles.createButtonText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>

      {/* Filters / Search */}
      <View style={styles.filtersContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search listings..."
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
        />
        <View style={styles.filterRow}>
          <TextInput style={styles.smallInput} placeholder="Category" value={category} onChangeText={setCategory} />
          <TextInput style={styles.smallInput} placeholder="Condition" value={itemCondition} onChangeText={setItemCondition} />
          <TextInput style={styles.smallInput} placeholder="City" value={locationCity} onChangeText={setLocationCity} />
        </View>
        <View style={[styles.filterRow, { marginTop: 8 }]}> 
          <TextInput style={styles.smallInput} placeholder="Min $" keyboardType="numeric" value={minPrice} onChangeText={setMinPrice} />
          <TextInput style={styles.smallInput} placeholder="Max $" keyboardType="numeric" value={maxPrice} onChangeText={setMaxPrice} />
          <TextInput style={styles.smallInput} placeholder="Limit" keyboardType="numeric" value={limit} onChangeText={setLimit} />
        </View>
        <View style={[styles.filterRow, { marginTop: 8, alignItems: 'center' }]}> 
          <Pressable style={styles.sortButton} onPress={() => setSortBy(sortBy === 'created_at' ? 'price' : sortBy === 'price' ? 'title' : 'created_at')}>
            <Text style={styles.sortButtonText}>Sort: {sortBy}</Text>
          </Pressable>
          <Pressable style={styles.sortButton} onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
            <Text style={styles.sortButtonText}>Order: {sortOrder}</Text>
          </Pressable>
          <Button title="Apply" onPress={() => fetchListings({ q, category, item_condition: itemCondition, location_city: locationCity, min_price: minPrice, max_price: maxPrice, sort_by: sortBy, sort_order: sortOrder }, false)} />
        </View>
      </View>

      {/* health check removed */}

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#2563EB" style={styles.loader} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item, index) =>
            String(item?.id ?? item?._id ?? `${item?.title ?? 'listing'}-${index}`)
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, { paddingBottom: 140 }]}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (!loadingMore && hasMore) {
              const params: Record<string, any> = {};
              if (q) params.q = q;
              if (category) params.category = category;
              if (minPrice) params.min_price = minPrice;
              if (maxPrice) params.max_price = maxPrice;
              if (itemCondition) params.item_condition = itemCondition;
              if (locationCity) params.location_city = locationCity;
              params.sort_by = sortBy;
              params.sort_order = sortOrder;
              fetchListings(params, true);
            }
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{margin:12}} /> : null}
          renderItem={({ item }) => {
            const firstImage = item.listing_images?.sort((a: any, b: any) => a.sort_order - b.sort_order)?.[0];
            const isOwner = user?.id === item.owner_user_id;
            return (
              <View style={styles.listCard}>
                {firstImage?.image_url && (
                  <Image
                    source={{ uri: firstImage.image_url }}
                    style={styles.listImage}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.listTitle}>{item.title}</Text>
                <Text style={styles.listDesc}>{item.description}</Text>
                <View style={styles.details}>
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: 'bold' }}>Price:</Text> ${item.price}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: 'bold' }}>Category:</Text> {item.category}
                  </Text>
                </View>
                <View style={styles.details}>
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: 'bold' }}>Location:</Text> {item.location_city}
                  </Text>
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: 'bold' }}>Condition:</Text> {item.item_condition}
                  </Text>
                </View>
                {isOwner ? (
                  <Pressable
                    style={styles.editButton}
                    onPress={() => navigation.navigate('EditListing', { listing: item })}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                      onPress={() => handleMessageSeller(item.id)}
                      disabled={messagingListingId === item.id}
                    >
                      {messagingListingId === item.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.actionButtonText}>Message Seller</Text>
                      }
                    </Pressable>

                    <Pressable
                      style={[styles.actionButton, { backgroundColor: requestedIds.includes(item.id) ? '#9CA3AF' : '#2563EB' }]}
                      onPress={() => handleRequestBuy(item.id, item.title, item.listing_images?.[0]?.image_url ?? item.listing_image_url)}
                      disabled={requestingId === item.id || requestedIds.includes(item.id)}
                    >
                      {requestingId === item.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.actionButtonText}>{requestedIds.includes(item.id) ? 'Requested' : 'Request to Buy'}</Text>
                      }
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No listings yet.</Text>}
        />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 28, fontWeight: '700' },
  createButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionButton: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  actionButtonText: { color: '#fff', fontWeight: '600' },
  loader: { flex: 1, justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 24 },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#E5E7EB',
  },
  listTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6, paddingHorizontal: 14, paddingTop: 12 },
  listDesc: { fontSize: 14, color: '#6B7280', marginBottom: 8, paddingHorizontal: 14 },
  details: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6, gap: 12, paddingHorizontal: 14, paddingBottom: 4 },
  detailText: { fontSize: 13, color: '#374151' },
  editButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 14,
    alignItems: 'center',
  },
  editButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  filtersContainer: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  searchInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: '#fff' },
  filterRow: { flexDirection: 'row', gap: 8 },
  smallInput: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 8, backgroundColor: '#fff' },
  sortButton: { backgroundColor: '#F3F4F6', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 8 },
  sortButtonText: { color: '#111827', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 24, fontSize: 16 },
});