import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, Pressable,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMessages, sendMessage } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';

const POLL_INTERVAL_MS = 3000;

export default function ChatScreen({ route, navigation }: { route: any; navigation: any }) {
  const { conversation } = route.params as { conversation: any };
  const { user } = useAuth();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const listingTitle = conversation.listings?.title ?? 'Listing';

  const fetchMessages = useCallback(async () => {
    try {
      const data = await getMessages(conversation.id, { limit: 100 });
      setMessages(data);
    } catch (err: any) {
      // Silently fail on poll errors; only show on initial load
    }
  }, [conversation.id]);

  // Initial load
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

  // Polling for new messages
  useEffect(() => {
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  useEffect(() => {
    navigation.setOptions({ title: listingTitle });
  }, [listingTitle, navigation]);

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
      setDraft(text); // restore draft on failure
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender_user_id === user?.id;
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
          {item.body}
        </Text>
        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={styles.loader} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            renderItem={renderMessage}
            ListEmptyComponent={
              <Text style={styles.empty}>No messages yet. Say hello!</Text>
            }
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  flex: { flex: 1 },
  loader: { marginTop: 40 },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextThem: { color: '#111827' },
  bubbleTime: { fontSize: 11, marginTop: 4 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  bubbleTimeThem: { color: '#9CA3AF' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 120,
    backgroundColor: '#F9FAFB',
  },
  sendButton: {
    backgroundColor: '#2563EB',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#93C5FD' },
  sendButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
