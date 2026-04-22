import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  updateListing as apiUpdateListing,
  deleteListing as apiDeleteListing,
  uploadListingImages,
  deleteListingImage,
} from '../api/listings';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/ui/Button';

const convertToJpeg = async (uri: string): Promise<{ uri: string; mimeType: string }> => {
  const result = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, mimeType: 'image/jpeg' };
};

const extensionForMimeType = (mimeType: string): string => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

const confirmAction = async (title: string, message: string, confirmText: string): Promise<boolean> => {
  if (Platform.OS === 'web') {
    if (typeof globalThis.confirm === 'function') {
      return globalThis.confirm(`${title}\n\n${message}`);
    }
    return false;
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
};

interface ExistingImage {
  id: string;
  image_url: string;
  sort_order: number;
}

interface NewImage {
  uri: string;
  mimeType?: string;
}

const STATUSES = ['active', 'inactive', 'sold'] as const;
type Status = typeof STATUSES[number];

export default function EditListingScreen({ route, navigation }: { route: any; navigation: any }) {
  const { listing } = route.params;
  const { theme } = useTheme();

  const [title, setTitle] = useState(listing.title || '');
  const [description, setDescription] = useState(listing.description || '');
  const [price, setPrice] = useState(listing.price?.toString() || '');
  const [category, setCategory] = useState(listing.category || '');
  const [locationCity, setLocationCity] = useState(listing.location_city || '');
  const [itemCondition, setItemCondition] = useState(listing.item_condition || '');
  const [status, setStatus] = useState<Status>((listing.status as Status) || 'active');
  const [loading, setLoading] = useState(false);

  const [existingImages, setExistingImages] = useState<ExistingImage[]>(
    (listing.listing_images || [])
      .slice()
      .sort((a: ExistingImage, b: ExistingImage) => a.sort_order - b.sort_order),
  );
  const [newImages, setNewImages] = useState<NewImage[]>([]);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  const totalImages = existingImages.length + newImages.length;
  const maxImages = 5;

  const handleRemoveExistingImage = async (imageId: string) => {
    const confirmed = await confirmAction('Remove image', 'Are you sure you want to remove this image?', 'Remove');
    if (!confirmed) return;

    setDeletingImageId(imageId);
    try {
      await deleteListingImage(listing.id, imageId);
      setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove image');
    } finally {
      setDeletingImageId(null);
    }
  };

  const handleRemoveNewImage = (index: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== index));
  };

  const pickImages = async () => {
    const remaining = maxImages - totalImages;
    if (remaining <= 0) return Alert.alert('Limit reached', `Maximum ${maxImages} images.`);
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return Alert.alert('Permission required', 'Access to your photo library is needed.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      const selected = result.assets.slice(0, remaining).map((a) => ({ uri: a.uri, mimeType: a.mimeType }));
      setNewImages((prev) => [...prev, ...selected].slice(0, maxImages - existingImages.length));
    }
  };

  const takePhoto = async () => {
    if (totalImages >= maxImages) return Alert.alert('Limit reached', `Maximum ${maxImages} images.`);
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) return Alert.alert('Permission required', 'Camera access is needed.');
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets.length > 0) {
      const a = result.assets[0];
      setNewImages((prev) =>
        [...prev, { uri: a.uri, mimeType: a.mimeType }].slice(0, maxImages - existingImages.length),
      );
    }
  };

  const uploadNewImages = async () => {
    if (newImages.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < newImages.length; i++) {
      const img = newImages[i];
      let uri = img.uri;
      let mimeType = img.mimeType || '';
      if (
        mimeType === 'image/heic' ||
        mimeType === 'image/heif' ||
        uri.toLowerCase().includes('.heic') ||
        !mimeType ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
      ) {
        const converted = await convertToJpeg(uri);
        uri = converted.uri;
        mimeType = converted.mimeType;
      }
      if (Platform.OS === 'web') {
        const fileResponse = await fetch(uri);
        const fileBlob = await fileResponse.blob();
        const finalMimeType = fileBlob.type || mimeType || 'image/jpeg';
        formData.append('images', fileBlob, `photo_${Date.now()}_${i}.${extensionForMimeType(finalMimeType)}`);
      } else {
        formData.append('images', {
          uri,
          name: `photo_${Date.now()}_${i}.${extensionForMimeType(mimeType || 'image/jpeg')}`,
          type: mimeType || 'image/jpeg',
        } as unknown as Blob);
      }
    }
    await uploadListingImages(listing.id, formData);
  };

  const save = async () => {
    if (!title.trim()) return Alert.alert('Missing title', 'Please add a title.');
    setLoading(true);
    try {
      const payload: Record<string, any> = {};
      if (title !== listing.title) payload.title = title;
      if (description !== (listing.description || '')) payload.description = description;
      if (price !== (listing.price?.toString() || '')) payload.price = price ? parseFloat(price) : null;
      if (category !== (listing.category || '')) payload.category = category;
      if (locationCity !== (listing.location_city || '')) payload.location_city = locationCity;
      if (itemCondition !== (listing.item_condition || '')) payload.item_condition = itemCondition;
      if (status !== (listing.status || 'active')) payload.status = status;

      const hasFieldChanges = Object.keys(payload).length > 0;
      const hasNewImages = newImages.length > 0;
      if (!hasFieldChanges && !hasNewImages) {
        setLoading(false);
        return Alert.alert('No changes', 'Nothing was modified.');
      }
      if (hasFieldChanges) await apiUpdateListing(listing.id, payload);
      if (hasNewImages) await uploadNewImages();
      Alert.alert('Saved', 'Your listing has been updated.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    const confirmed = await confirmAction('Delete listing', 'This cannot be undone.', 'Delete');
    if (!confirmed) return;

    setLoading(true);
    try {
      await apiDeleteListing(listing.id);
      Alert.alert('Deleted', 'Listing has been deleted.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.topTitle}>Edit listing</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()} disabled={Platform.OS === 'web'}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>
              Photos ({totalImages}/{maxImages})
            </Text>
            <View style={styles.photoRow}>
              {existingImages.map((img) => (
                <View key={img.id} style={styles.photoWrap}>
                  <Image source={{ uri: img.image_url }} style={styles.photo} />
                  {deletingImageId === img.id ? (
                    <View style={styles.removeBadge}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                  ) : (
                    <Pressable style={styles.removeBadge} onPress={() => handleRemoveExistingImage(img.id)} hitSlop={6}>
                      <Text style={styles.removeBadgeText}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {newImages.map((img, index) => (
                <View key={`new-${index}`} style={styles.photoWrap}>
                  <Image source={{ uri: img.uri }} style={styles.photo} />
                  <Pressable style={styles.removeBadge} onPress={() => handleRemoveNewImage(index)} hitSlop={6}>
                    <Text style={styles.removeBadgeText}>×</Text>
                  </Pressable>
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>NEW</Text>
                  </View>
                </View>
              ))}
              {totalImages < maxImages && (
                <Pressable onPress={pickImages} style={styles.addPhoto}>
                  <Text style={styles.addPhotoPlus}>+</Text>
                  <Text style={styles.addPhotoText}>Add</Text>
                </Pressable>
              )}
            </View>
            {totalImages < maxImages && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <Button variant="ghost" size="sm" style={{ flex: 1 }} onPress={takePhoto}>
                  📷 Take photo
                </Button>
                <Button variant="ghost" size="sm" style={{ flex: 1 }} onPress={pickImages}>
                  🖼 Pick images
                </Button>
              </View>
            )}

            <Text style={styles.sectionLabel}>Item details</Text>
            <TextInput
              placeholder="Title"
              placeholderTextColor={theme.colors.muted}
              value={title}
              onChangeText={setTitle}
              style={styles.input}
            />
            <TextInput
              placeholder="Description"
              placeholderTextColor={theme.colors.muted}
              value={description}
              onChangeText={setDescription}
              style={[styles.input, styles.textArea]}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                placeholder="Price $"
                placeholderTextColor={theme.colors.muted}
                value={price}
                onChangeText={setPrice}
                style={[styles.input, { flex: 1 }]}
                keyboardType="numeric"
              />
              <TextInput
                placeholder="Condition"
                placeholderTextColor={theme.colors.muted}
                value={itemCondition}
                onChangeText={setItemCondition}
                style={[styles.input, { flex: 1 }]}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                placeholder="Category"
                placeholderTextColor={theme.colors.muted}
                value={category}
                onChangeText={setCategory}
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                placeholder="City"
                placeholderTextColor={theme.colors.muted}
                value={locationCity}
                onChangeText={setLocationCity}
                style={[styles.input, { flex: 1 }]}
              />
            </View>

            <Text style={styles.sectionLabel}>Status</Text>
            <View style={styles.statusRow}>
              {STATUSES.map((s) => {
                const active = status === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    style={[styles.statusChip, active && styles.statusChipActive]}
                  >
                    <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Button size="lg" fullWidth onPress={save} disabled={loading} style={{ marginTop: 16 }}>
              {loading ? 'Saving…' : 'Save changes'}
            </Button>

            <View style={styles.deleteSection}>
              <Button variant="danger" fullWidth onPress={remove} disabled={loading}>
                Delete listing
              </Button>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
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
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    backArrow: { fontSize: 24, color: theme.colors.text },
    topTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },

    content: { padding: 20, paddingBottom: 40 },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 12,
      marginBottom: 8,
    },

    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    photoWrap: { position: 'relative', width: 80, height: 80 },
    photo: { width: 80, height: 80, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceAlt },
    removeBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: theme.colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeBadgeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', lineHeight: 18 },
    newBadge: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.radii.sm,
    },
    newBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
    addPhoto: {
      width: 80,
      height: 80,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    addPhotoPlus: { fontSize: 24, color: theme.colors.muted, fontWeight: '300' },
    addPhotoText: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },

    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.colors.text,
      marginBottom: 10,
      backgroundColor: theme.colors.surface,
    },
    textArea: { height: 100, textAlignVertical: 'top' },

    statusRow: { flexDirection: 'row', gap: 8 },
    statusChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
    },
    statusChipActive: { backgroundColor: theme.colors.text },
    statusChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
    statusChipTextActive: { color: '#FFFFFF' },

    deleteSection: {
      marginTop: 24,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
  });
