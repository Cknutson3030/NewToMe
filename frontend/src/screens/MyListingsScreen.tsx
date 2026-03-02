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

export default function MyListingsScreen({ navigation }: { navigation: any }) {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyListings = useCallback(async () => {
    try {
      const res = await getMyListings();
      const data = Array.isArray(res) ? res : res.data || [];
      setListings(data);
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
