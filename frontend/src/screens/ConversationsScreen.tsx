import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable,
  Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { listConversations } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { Card, Skeleton } from '../components/ui';

export default function ConversationsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const { theme } = useTheme();
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

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations]),
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
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString();
  };

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.topTitle}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && !refreshing ? (
        <View style={{ padding: 16 }}>
          <Skeleton style={{ height: 76, borderRadius: 16, marginBottom: 12 }} />
          <Skeleton style={{ height: 76, borderRadius: 16, marginBottom: 12 }} />
          <Skeleton style={{ height: 76, borderRadius: 16 }} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          renderItem={({ item }) => {
            const isBuyer = item.buyer_user_id === user?.id;
            const otherName = isBuyer
              ? (item.seller_display_name ?? 'Seller')
              : (item.buyer_display_name ?? 'Buyer');
            const lastMsg = item.last_message;
            const hasUnread = item.has_unread;
            const avatarLetter = (otherName || '?')[0].toUpperCase();
            return (
              <Pressable onPress={() => navigation.navigate('Chat', { conversation: item })}>
                <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.avatar, hasUnread && { backgroundColor: theme.colors.primary }]}>
                    <Text style={[styles.avatarText, hasUnread && { color: '#FFFFFF' }]}>{avatarLetter}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.rowTop}>
                      <Text style={[styles.name, hasUnread && styles.nameUnread]} numberOfLines={1}>
                        {otherName}
                      </Text>
                      {lastMsg && (
                        <Text style={[styles.time, hasUnread && styles.timeUnread]}>
                          {formatTime(lastMsg.created_at)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.listingTitle} numberOfLines={1}>
                      {item.listings?.title ?? 'Listing'}
                    </Text>
                    <View style={styles.rowBottom}>
                      {lastMsg ? (
                        <Text style={[styles.preview, hasUnread && styles.previewUnread]} numberOfLines={1}>
                          {lastMsg.sender_user_id === user?.id ? 'You: ' : ''}{lastMsg.body}
                        </Text>
                      ) : (
                        <Text style={styles.noMessages}>No messages yet</Text>
                      )}
                      {hasUnread && <View style={styles.unreadDot} />}
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>
                No conversations yet
              </Text>
              <Text style={{ fontSize: 14, color: theme.colors.muted, textAlign: 'center', paddingHorizontal: 32 }}>
                Tap "Message seller" on any listing to start one.
              </Text>
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

    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 18, fontWeight: '700', color: theme.colors.text },

    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    name: { fontSize: 15, fontWeight: '700', color: theme.colors.text, flex: 1, marginRight: 8 },
    nameUnread: { color: theme.colors.primary },
    time: { fontSize: 11, color: theme.colors.muted },
    timeUnread: { color: theme.colors.primary, fontWeight: '700' },

    listingTitle: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },

    rowBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    preview: { fontSize: 13, color: theme.colors.muted, flex: 1 },
    previewUnread: { color: theme.colors.text, fontWeight: '600' },
    noMessages: { fontSize: 13, color: theme.colors.muted, fontStyle: 'italic', flex: 1 },
    unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.colors.primary, marginLeft: 8 },
  });
