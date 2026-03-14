import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { listConversations } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';

export default function ConversationsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listConversations();
      setConversations(data);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await listConversations();
      setConversations(data);
    } catch {
      Alert.alert('Error', 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#2563EB" style={styles.loader} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
          renderItem={({ item }) => {
            const isBuyer = item.buyer_user_id === user?.id;
            const role = isBuyer ? 'Buyer' : 'Seller';
            const lastMsg = item.last_message;
            return (
              <Pressable
                style={styles.card}
                onPress={() => navigation.navigate('Chat', { conversation: item })}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.listingTitle} numberOfLines={1}>
                    {item.listings?.title ?? 'Listing'}
                  </Text>
                  {lastMsg && (
                    <Text style={styles.time}>{formatTime(lastMsg.created_at)}</Text>
                  )}
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.roleBadge}>{role}</Text>
                  {lastMsg ? (
                    <Text style={styles.preview} numberOfLines={1}>
                      {lastMsg.sender_user_id === user?.id ? 'You: ' : ''}{lastMsg.body}
                    </Text>
                  ) : (
                    <Text style={styles.noMessages}>No messages yet</Text>
                  )}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>No conversations yet.{'\n'}Tap "Message Seller" on any listing to start one.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 28, fontWeight: '700' },
  loader: { marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  listingTitle: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  time: { fontSize: 12, color: '#9CA3AF' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  preview: { fontSize: 14, color: '#6B7280', flex: 1 },
  noMessages: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15, lineHeight: 24, paddingHorizontal: 32 },
});
