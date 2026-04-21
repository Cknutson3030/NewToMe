import React from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import Card from './ui/Card';
import Button from './ui/Button';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  item: any;
  onPressMessage?: (id: string) => void;
  onPressRequest?: (item: any) => void;
  onPressEdit?: (item: any) => void;
  isOwner?: boolean;
  requested?: boolean;
};

function ListingCard({ item, onPressMessage, onPressRequest, onPressEdit, isOwner, requested }: Props) {
  const { theme } = useTheme();
  const firstImage = item.listing_images?.sort?.((a: any, b: any) => a.sort_order - b.sort_order)?.[0];
  const imageUrl = firstImage?.image_url ?? item.listing_image_url;

  const ghgSaved = isOwner
    ? Number(item.ghg_end_of_life_kg) || 0
    : (Number(item.ghg_manufacturing_kg) || 0) +
      (Number(item.ghg_materials_kg) || 0) +
      (Number(item.ghg_transport_kg) || 0);

  const styles = makeStyles(theme);

  return (
    <Card padding="none" style={styles.card}>
      <View style={styles.imageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderText}>No image</Text>
          </View>
        )}
        {item.item_condition ? (
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionBadgeText}>{item.item_condition}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.price}>{item.price != null ? `$${item.price}` : '—'}</Text>
        </View>

        {item.description ? (
          <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          {item.location_city ? (
            <Text style={styles.meta} numberOfLines={1}>📍 {item.location_city}</Text>
          ) : null}
        </View>

        {ghgSaved > 0 ? (
          <View style={styles.ghgBadge}>
            <Text style={styles.ghgText}>
              Saves {ghgSaved.toFixed(1)} kg CO₂e {isOwner ? 'vs. landfill' : 'vs. new'}
            </Text>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {isOwner ? (
            <Button variant="secondary" size="sm" style={styles.action} onPress={() => onPressEdit?.(item)}>
              Edit
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" style={styles.action} onPress={() => onPressMessage?.(item.id)}>
                Message
              </Button>
              <Button size="sm" style={styles.action} onPress={() => onPressRequest?.(item)}>
                {requested ? 'Requested' : 'Make offer'}
              </Button>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    card: {
      marginBottom: theme.spacing.md,
      overflow: 'hidden',
    },
    imageWrap: {
      position: 'relative',
      backgroundColor: theme.colors.surfaceAlt,
    },
    image: {
      width: '100%',
      height: 220,
    },
    imagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      color: theme.colors.muted,
      fontSize: 14,
    },
    conditionBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      backgroundColor: 'rgba(17,17,17,0.8)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: theme.radii.pill,
    },
    conditionBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    body: { padding: 14 },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
      flex: 1,
      marginRight: 8,
    },
    price: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    desc: {
      fontSize: 14,
      color: theme.colors.muted,
      marginBottom: 8,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    meta: {
      fontSize: 13,
      color: theme.colors.muted,
    },
    ghgBadge: {
      backgroundColor: theme.colors.primarySoft,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-start',
      marginBottom: 10,
    },
    ghgText: {
      fontSize: 12,
      color: theme.colors.primary,
      fontWeight: '600',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    action: { flex: 1 },
  });

export default React.memo(ListingCard, (prev, next) => {
  return (
    prev.item?.id === next.item?.id &&
    prev.isOwner === next.isOwner &&
    prev.requested === next.requested
  );
});
