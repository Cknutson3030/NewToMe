import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Button, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert } from 'react-native';

const LISTINGS_URL = 'http://172.16.1.252:3000/listings';
const HEALTH_URL = 'http://172.16.1.252:3000/health';
// AUTH BYPASSED - no token needed (backend auth is disabled)

export default function HomeScreen({ navigation }: { navigation: any }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState('');

  // Fetch listings on component mount
  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const res = await fetch(LISTINGS_URL);
      const data = await res.json();
      setListings(data.data || []);
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch listings');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(LISTINGS_URL);
      const data = await res.json();
      setListings(data.data || []);
    } catch (err) {
      Alert.alert('Error', 'Failed to refresh listings');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch(HEALTH_URL);
      const data = await res.json();
      setHealth(data.status || 'Healthy');
    } catch (err) {
      setHealth('Error connecting to backend');
    }
  };

  // Render UI
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Listings</Text>
        <Pressable style={styles.createButton} onPress={() => navigation.navigate('CreateListing')}>
          <Text style={styles.createButtonText}>+ New Listing</Text>
        </Pressable>
      </View>

      <View style={styles.healthSection}>
        <Pressable style={styles.healthButton} onPress={checkHealth}>
          <Text style={styles.healthButtonText}>Check Backend Health</Text>
        </Pressable>
        {health ? <Text style={styles.healthText}>{health}</Text> : null}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#2563EB" style={styles.loader} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item, index) =>
            String(item?.id ?? item?._id ?? `${item?.title ?? 'listing'}-${index}`)
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
          }
          renderItem={({ item }) => {
            const firstImage = item.listing_images?.sort((a: any, b: any) => a.sort_order - b.sort_order)?.[0];
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
                <Pressable
                  style={styles.editButton}
                  onPress={() => navigation.navigate('EditListing', { listing: item })}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No listings yet.</Text>}
        />
      )}
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
  healthSection: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  healthButton: { backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  healthButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  healthText: { marginTop: 8, color: '#059669', fontWeight: '500', textAlign: 'center' },
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
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 24, fontSize: 16 },
});