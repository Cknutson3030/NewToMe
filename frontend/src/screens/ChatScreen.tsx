import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, Pressable,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMessages, sendMessage } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';

const POLL_INTERVAL_MS = 3000;

export default function ChatScreen({ route, navigation }: { route: any; navigation: any }) {
  const { conversation } = route.params as { conversation: any };
  const { user } = useAuth();
  const { theme } = useTheme();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const listingTitle = conversation.listings?.title ?? 'Listing';
  const isBuyer = conversation.buyer_user_id === user?.id;
  const otherLabel = isBuyer
    ? (conversation.seller_display_name ?? 'Seller')
    : (conversation.buyer_display_name ?? 'Buyer');

  const fetchMessages = useCallback(async () => {
    try {
      const data = await getMessages(conversation.id, { limit: 100 });
      setMessages(data);
    } catch {
      /* silent poll */
    }
  }, [conversation.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getMessages(conversation.id, { limit: 100 });
        setMessages(data);
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    })();
  }, [conversation.id]);

  useEffect(() => {
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await sendMessage(conversation.id, text);
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send message');
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const styles = makeStyles(theme);

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const isMe = item.sender_user_id === user?.id;
    const prevItem = messages[index - 1];
    const showLabel = !isMe && (!prevItem || prevItem.sender_user_id !== item.sender_user_id);
    return (
      <View style={isMe ? styles.rowMe : styles.rowThem}>
        {showLabel && <Text style={styles.senderLabel}>{otherLabel}</Text>}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.body}
          </Text>
          <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.topTitle} numberOfLines={1}>{otherLabel}</Text>
          <Text style={styles.topSub} numberOfLines={1}>{listingTitle}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            renderItem={renderMessage}
            ListEmptyComponent={
              <Text style={styles.empty}>No messages yet. Say hello!</Text>
            }
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            placeholderTextColor={theme.colors.muted}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !draft.trim()}
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
          >
            <Text style={styles.sendBtnText}>{sending ? '…' : '↑'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    backArrow: { fontSize: 24, color: theme.colors.text, width: 24 },
    topTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    topSub: { fontSize: 11, color: theme.colors.muted, marginTop: 1 },

    rowMe: { alignItems: 'flex-end', marginBottom: 8 },
    rowThem: { alignItems: 'flex-start', marginBottom: 8 },
    senderLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.muted,
      marginBottom: 3,
      marginLeft: 4,
    },
    bubble: {
      maxWidth: '80%',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    bubbleMe: {
      backgroundColor: theme.colors.primary,
      borderBottomRightRadius: 4,
    },
    bubbleThem: {
      backgroundColor: theme.colors.surfaceAlt,
      borderBottomLeftRadius: 4,
    },
    bubbleText: { fontSize: 15, lineHeight: 20 },
    bubbleTextMe: { color: '#FFFFFF' },
    bubbleTextThem: { color: theme.colors.text },
    bubbleTime: { fontSize: 10, marginTop: 3 },
    bubbleTimeMe: { color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
    bubbleTimeThem: { color: theme.colors.muted },

    empty: { textAlign: 'center', color: theme.colors.muted, marginTop: 60, fontSize: 15 },

    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      gap: 8,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.colors.text,
      maxHeight: 120,
      backgroundColor: theme.colors.surfaceAlt,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: theme.colors.primaryLight, opacity: 0.6 },
    sendBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', lineHeight: 22 },
  });
