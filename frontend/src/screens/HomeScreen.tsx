import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getListings } from '../api/listings';
import { getOrCreateConversation } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/ui/Button';
import ListingCard from '../components/ListingCard';

type Listing = {
  id?: string;
  _id?: string;
  title?: string;
  description?: string;
  owner_user_id?: string;
  listing_images?: { image_url?: string; sort_order?: number }[];
  listing_image_url?: string;
  price?: number;
  location_city?: string;
  item_condition?: string;
};

const CONDITIONS = ['', 'new', 'like_new', 'good', 'fair'];

export default function HomeScreen({ navigation }: { navigation: any }) {
  const { signOut, user } = useAuth();
  const { theme } = useTheme();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [itemCondition, setItemCondition] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'price' | 'title'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debounceRef = useRef<any>(null);
  const limit = 20;

  const buildParams = useCallback(() => {
    const p: Record<string, any> = {};
    if (q) p.q = q;
    if (category) p.category = category;
    if (minPrice) p.min_price = minPrice;
    if (maxPrice) p.max_price = maxPrice;
    if (itemCondition) p.item_condition = itemCondition;
    if (locationCity) p.location_city = locationCity;
    p.sort_by = sortBy;
    p.sort_order = sortOrder;
    p.limit = limit;
    return p;
  }, [q, category, minPrice, maxPrice, itemCondition, locationCity, sortBy, sortOrder]);

  const fetchListings = useCallback(async (append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = buildParams();
      params.offset = append ? offset : 0;
      const res = await getListings(params);
      const all = Array.isArray(res) ? res : res.data || [];
      const filtered = (user?.id ? all.filter((i: any) => i.owner_user_id !== user.id) : all) as Listing[];

      if (append) {
        setListings((prev) => [...prev, ...filtered]);
        setOffset((prev) => prev + filtered.length);
      } else {
        setListings(filtered);
        setOffset(filtered.length);
      }
      setHasMore(filtered.length === limit);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch listings');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [buildParams, offset, user?.id]);

  useEffect(() => { fetchListings(false); }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchListings(false);
    });
    return unsubscribe;
  }, [navigation, fetchListings]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchListings(false), 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, category, minPrice, maxPrice, itemCondition, locationCity, sortBy, sortOrder]);

  const onRefresh = () => { setRefreshing(true); fetchListings(false); };

  const handleMessage = useCallback(async (listingId: string) => {
    try {
      const conversation = await getOrCreateConversation(listingId);
      navigation.navigate('Chat', { conversation });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not open conversation');
    }
  }, [navigation]);

  const handleRequestBuy = useCallback((item: any) => {
    navigation.navigate('Offer', {
      listingId: item.id,
      listingTitle: item.title,
      listingImage: item.listing_images?.[0]?.image_url ?? item.listing_image_url,
      listingPrice: item.price,
      listingLocation: item.location_city,
      listingCondition: item.item_condition,
    });
  }, [navigation]);

  const clearFilters = () => {
    setCategory('');
    setMinPrice('');
    setMaxPrice('');
    setItemCondition('');
    setLocationCity('');
    setSortBy('created_at');
    setSortOrder('desc');
  };

  const activeFilterCount =
    (category ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (itemCondition ? 1 : 0) +
    (locationCity ? 1 : 0);

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Discover</Text>
          <Text style={styles.greetingSub}>Find your next pre-loved find</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Profile')} style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchField}
            placeholder="Search items, brands, keywords…"
            placeholderTextColor={theme.colors.muted}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
          />
        </View>
        <Pressable onPress={() => setFiltersOpen(true)} style={styles.filterButton}>
          <Text style={styles.filterButtonText}>Filters</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item, index) => String(item?.id ?? item?._id ?? `${item?.title ?? 'listing'}-${index}`)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (!loadingMore && hasMore) fetchListings(true); }}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={theme.colors.primary} /> : null}
          renderItem={({ item }) => {
            const isOwner = user?.id === item.owner_user_id;
            return (
              <ListingCard
                item={item}
                isOwner={isOwner}
                onPressMessage={handleMessage}
                onPressRequest={handleRequestBuy}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>Try adjusting filters or check back soon.</Text>
            </View>
          }
        />
      )}

      <View style={styles.tabBar}>
        <TabButton label="Browse" icon="🏠" active onPress={() => {}} />
        <TabButton label="Listings" icon="📦" onPress={() => navigation.navigate('MyListings')} />
        <TabPrimaryButton onPress={() => navigation.navigate('CreateListing')} />
        <TabButton label="Messages" icon="💬" onPress={() => navigation.navigate('Conversations')} />
        <TabButton label="Purchases" icon="🛍" onPress={() => navigation.navigate('Purchases')} />
      </View>

      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        category={category} setCategory={setCategory}
        minPrice={minPrice} setMinPrice={setMinPrice}
        maxPrice={maxPrice} setMaxPrice={setMaxPrice}
        itemCondition={itemCondition} setItemCondition={setItemCondition}
        locationCity={locationCity} setLocationCity={setLocationCity}
        sortBy={sortBy} setSortBy={setSortBy}
        sortOrder={sortOrder} setSortOrder={setSortOrder}
        onClear={clearFilters}
        theme={theme}
      />
    </SafeAreaView>
  );
}

function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active?: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
      <Text style={{ fontSize: 20, opacity: active ? 1 : 0.55 }}>{icon}</Text>
      <Text style={{ fontSize: 11, fontWeight: '600', marginTop: 2, color: active ? theme.colors.primary : theme.colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function TabPrimaryButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <View style={{
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -16,
        shadowColor: theme.colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}>
        <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
      </View>
    </Pressable>
  );
}

function FiltersSheet({
  visible, onClose,
  category, setCategory,
  minPrice, setMinPrice, maxPrice, setMaxPrice,
  itemCondition, setItemCondition,
  locationCity, setLocationCity,
  sortBy, setSortBy, sortOrder, setSortOrder,
  onClear, theme,
}: any) {
  const styles = makeStyles(theme);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Filters</Text>
          <Pressable onPress={onClear}><Text style={styles.clearText}>Clear all</Text></Pressable>
        </View>

        <ScrollView style={{ maxHeight: '100%' }}>
          <Text style={styles.sheetLabel}>Category</Text>
          <TextInput style={styles.sheetInput} placeholder="e.g. Electronics" placeholderTextColor={theme.colors.muted} value={category} onChangeText={setCategory} />

          <Text style={styles.sheetLabel}>Location</Text>
          <TextInput style={styles.sheetInput} placeholder="City" placeholderTextColor={theme.colors.muted} value={locationCity} onChangeText={setLocationCity} />

          <Text style={styles.sheetLabel}>Price range</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[styles.sheetInput, { flex: 1 }]} placeholder="Min $" placeholderTextColor={theme.colors.muted} keyboardType="numeric" value={minPrice} onChangeText={setMinPrice} />
            <TextInput style={[styles.sheetInput, { flex: 1 }]} placeholder="Max $" placeholderTextColor={theme.colors.muted} keyboardType="numeric" value={maxPrice} onChangeText={setMaxPrice} />
          </View>

          <Text style={styles.sheetLabel}>Condition</Text>
          <View style={styles.chipRow}>
            {CONDITIONS.map((c) => (
              <Pressable key={c || 'any'} onPress={() => setItemCondition(c)}
                style={[styles.chip, itemCondition === c && styles.chipActive]}>
                <Text style={[styles.chipText, itemCondition === c && styles.chipTextActive]}>
                  {c ? c.replace('_', ' ') : 'Any'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sheetLabel}>Sort by</Text>
          <View style={styles.chipRow}>
            {(['created_at', 'price', 'title'] as const).map((s) => (
              <Pressable key={s} onPress={() => setSortBy(s)} style={[styles.chip, sortBy === s && styles.chipActive]}>
                <Text style={[styles.chipText, sortBy === s && styles.chipTextActive]}>
                  {s === 'created_at' ? 'Newest' : s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} style={[styles.chip]}>
              <Text style={styles.chipText}>{sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}</Text>
            </Pressable>
          </View>

          <Button size="lg" fullWidth onPress={onClose} style={{ marginTop: 20, marginBottom: 24 }}>
            Apply
          </Button>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
    },
    greeting: { fontSize: 26, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.5 },
    greetingSub: { fontSize: 14, color: theme.colors.muted, marginTop: 2 },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: theme.colors.primary, fontWeight: '700', fontSize: 16 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radii.lg,
      paddingHorizontal: 14,
      height: 46,
    },
    searchIcon: { fontSize: 15, marginRight: 8 },
    searchField: { flex: 1, fontSize: 15, color: theme.colors.text },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      height: 46,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radii.lg,
    },
    filterButtonText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
    filterBadge: {
      marginLeft: 6,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

    loader: { flex: 1, justifyContent: 'center' },
    listContent: { paddingHorizontal: 16, paddingBottom: 110 },

    empty: { alignItems: 'center', marginTop: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
    emptyBody: { fontSize: 14, color: theme.colors.muted },

    tabBar: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 8,
      paddingHorizontal: 6,
      ...theme.elevation.raised,
    },

    // Filter sheet
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 24,
      maxHeight: '80%',
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      marginBottom: 12,
    },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    clearText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
    sheetLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
    sheetInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.colors.text,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    chipText: { fontSize: 13, color: theme.colors.text, fontWeight: '500', textTransform: 'capitalize' },
    chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  });
