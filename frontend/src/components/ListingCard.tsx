import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Card from './ui/Card';
import Button from './ui/Button';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  item: any;
  onPressMessage?: (id: string) => void;
  onPressRequest?: (id: string) => void;
  onPressEdit?: (item: any) => void;
  isOwner?: boolean;
  loadingAction?: boolean;
  requested?: boolean;
};

export default function ListingCard({ item, onPressMessage, onPressRequest, onPressEdit, isOwner, loadingAction, requested }: Props) {
  const { theme } = useTheme();
  const firstImage = item.listing_images?.sort?.((a: any,b: any)=>a.sort_order-b.sort_order)?.[0];
  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      {firstImage?.image_url ? (
        <Image source={{ uri: firstImage.image_url }} style={styles.image} />
      ) : null}
      <Text style={[styles.title, theme.typography.body]}>{item.title}</Text>
      {item.description ? <Text style={[styles.desc, theme.typography.small]} numberOfLines={2}>{item.description}</Text> : null}
      <View style={styles.detailsRow}>
        <Text style={[styles.detailText, { fontWeight: '700', color: theme.colors.success }]}>{item.price != null ? `$${item.price}` : '—'}</Text>
        <Text style={styles.detailText}>{item.location_city}</Text>
      </View>

      <View style={{ flexDirection: 'row', marginTop: theme.spacing.sm }}>
        {isOwner ? (
          <Button variant="ghost" onPress={() => onPressEdit?.(item)}>Edit</Button>
        ) : (
          <>
            <Button style={{ marginRight: 8 }} onPress={() => onPressMessage?.(item.id)}>Message</Button>
            <Button onPress={() => onPressRequest?.(item.id)}>{requested ? 'Requested' : 'Request'}</Button>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 160, borderRadius: 8, marginBottom: 8, backgroundColor: '#E5E7EB' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  desc: { color: '#6B7280', marginBottom: 8 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailText: { fontSize: 13, color: '#374151' },
});
//reusable UI components