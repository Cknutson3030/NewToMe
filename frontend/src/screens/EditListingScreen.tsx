import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Button,
    Alert,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
    updateListing as apiUpdateListing,
    deleteListing as apiDeleteListing,
    uploadListingImages,
    deleteListingImage,
} from '../api/listings';

// Convert image to JPEG (handles HEIC from iPhone)
const convertToJpeg = async (uri: string): Promise<{ uri: string; mimeType: string }> => {
    const result = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: result.uri, mimeType: 'image/jpeg' };
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

export default function EditListingScreen({ route, navigation }: { route: any; navigation: any }) {
    const { listing } = route.params;

    // State for form fields (pre-filled with existing data)
    const [title, setTitle] = useState(listing.title || '');
    const [description, setDescription] = useState(listing.description || '');
    const [price, setPrice] = useState(listing.price?.toString() || '');
    const [category, setCategory] = useState(listing.category || '');
    const [locationCity, setLocationCity] = useState(listing.location_city || '');
    const [itemCondition, setItemCondition] = useState(listing.item_condition || '');
    const [status, setStatus] = useState(listing.status || 'active');
    const [loading, setLoading] = useState(false);

    // Image state
    const [existingImages, setExistingImages] = useState<ExistingImage[]>(
        (listing.listing_images || [])
            .slice()
            .sort((a: ExistingImage, b: ExistingImage) => a.sort_order - b.sort_order)
    );
    const [newImages, setNewImages] = useState<NewImage[]>([]);
    const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

    const totalImages = existingImages.length + newImages.length;
    const maxImages = 5;

    // Remove an existing image (calls backend)
    const handleRemoveExistingImage = async (imageId: string) => {
        Alert.alert('Remove Image', 'Are you sure you want to remove this image?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    setDeletingImageId(imageId);
                    try {
                        await deleteListingImage(listing.id, imageId);
                        setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
                    } catch (err) {
                        console.error('[removeImage] Error:', err);
                        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove image');
                    } finally {
                        setDeletingImageId(null);
                    }
                },
            },
        ]);
    };

    // Remove a newly-picked (not yet uploaded) image
    const handleRemoveNewImage = (index: number) => {
        setNewImages((prev) => prev.filter((_, i) => i !== index));
    };

    // Pick images from library
    const pickImages = async () => {
        const remaining = maxImages - totalImages;
        if (remaining <= 0) {
            Alert.alert('Limit Reached', `Maximum ${maxImages} images allowed.`);
            return;
        }

        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('Permission required', 'Permission to access camera roll is required!');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.7,
        });

        if (!result.canceled) {
            const selected = result.assets.slice(0, remaining).map((a) => ({
                uri: a.uri,
                mimeType: a.mimeType,
            }));
            setNewImages((prev) => [...prev, ...selected].slice(0, maxImages - existingImages.length));
        }
    };

    // Take a photo with camera
    const takePhoto = async () => {
        if (totalImages >= maxImages) {
            Alert.alert('Limit Reached', `Maximum ${maxImages} images allowed.`);
            return;
        }

        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('Permission required', 'Permission to access camera is required!');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!result.canceled && result.assets.length > 0) {
            const a = result.assets[0];
            setNewImages((prev) =>
                [...prev, { uri: a.uri, mimeType: a.mimeType }].slice(0, maxImages - existingImages.length)
            );
        }
    };

    // Upload newly-added images
    const uploadNewImages = async () => {
        if (newImages.length === 0) return;

        const formData = new FormData();
        for (let i = 0; i < newImages.length; i++) {
            const img = newImages[i];
            let uri = img.uri;
            let mimeType = img.mimeType || '';

            // Convert HEIC/HEIF or unknown formats to JPEG
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

            const fileName = `photo_${Date.now()}_${i}.jpg`;
            formData.append('images', {
                uri,
                name: fileName,
                type: mimeType,
            } as unknown as Blob);
        }

        await uploadListingImages(listing.id, formData);
    };

    // Save all changes
    const updateListing = async () => {
        if (!title.trim()) {
            Alert.alert('Error', 'Title is required');
            return;
        }

        setLoading(true);
        try {
            // Build update payload with only changed fields
            const payload: Record<string, any> = {};
            if (title !== listing.title) payload.title = title;
            if (description !== (listing.description || '')) payload.description = description;
            if (price !== (listing.price?.toString() || '')) {
                payload.price = price ? parseFloat(price) : null;
            }
            if (category !== (listing.category || '')) payload.category = category;
            if (locationCity !== (listing.location_city || '')) payload.location_city = locationCity;
            if (itemCondition !== (listing.item_condition || '')) payload.item_condition = itemCondition;
            if (status !== (listing.status || 'active')) payload.status = status;

            const hasFieldChanges = Object.keys(payload).length > 0;
            const hasNewImages = newImages.length > 0;

            if (!hasFieldChanges && !hasNewImages) {
                Alert.alert('No Changes', 'No fields were modified');
                setLoading(false);
                return;
            }

            // Update text fields if changed
            if (hasFieldChanges) {
                await apiUpdateListing(listing.id, payload);
            }

            // Upload new images if any
            if (hasNewImages) {
                await uploadNewImages();
            }

            Alert.alert('Success', 'Listing updated!');
            navigation.goBack();
        } catch (err) {
            console.error('[updateListing] Error:', err);
            Alert.alert('Error', err instanceof Error ? err.message : 'Network error');
        } finally {
            setLoading(false);
        }
    };

    // Delete the entire listing
    const deleteListing = async () => {
        Alert.alert(
            'Delete Listing',
            'Are you sure you want to delete this listing? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            await apiDeleteListing(listing.id);
                            Alert.alert('Deleted', 'Listing has been deleted.');
                            navigation.goBack();
                        } catch (err) {
                            console.error('[deleteListing] Error:', err);
                            Alert.alert('Error', err instanceof Error ? err.message : 'Network error');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 80}>
            <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
                <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.header}>Edit Listing</Text>

            {/* ── Images Section ── */}
            <Text style={styles.label}>
                Images ({totalImages}/{maxImages})
            </Text>

            <View style={styles.imageGrid}>
                {/* Existing images */}
                {existingImages.map((img) => (
                    <View key={img.id} style={styles.imageWrapper}>
                        <Image source={{ uri: img.image_url }} style={styles.imageThumb} />
                        {deletingImageId === img.id ? (
                            <View style={styles.removeBadge}>
                                <ActivityIndicator size="small" color="#fff" />
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={styles.removeBadge}
                                onPress={() => handleRemoveExistingImage(img.id)}
                            >
                                <Text style={styles.removeBadgeText}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ))}

                {/* Newly picked images */}
                {newImages.map((img, index) => (
                    <View key={`new-${index}`} style={styles.imageWrapper}>
                        <Image source={{ uri: img.uri }} style={styles.imageThumb} />
                        <TouchableOpacity
                            style={[styles.removeBadge, { backgroundColor: '#F59E0B' }]}
                            onPress={() => handleRemoveNewImage(index)}
                        >
                            <Text style={styles.removeBadgeText}>✕</Text>
                        </TouchableOpacity>
                        <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                    </View>
                ))}
            </View>

            {totalImages < maxImages && (
                <View style={styles.imageButtons}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                        <Button title="Pick Images" onPress={pickImages} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Button title="Take Photo" onPress={takePhoto} />
                    </View>
                </View>
            )}

            {/* ── Form Fields ── */}
            <TextInput
                placeholder="Title *"
                value={title}
                onChangeText={setTitle}
                style={styles.input}
            />

            <TextInput
                placeholder="Description"
                value={description}
                onChangeText={setDescription}
                style={[styles.input, styles.textArea]}
                multiline
                numberOfLines={3}
            />

            <TextInput
                placeholder="Price"
                value={price}
                onChangeText={setPrice}
                style={styles.input}
                keyboardType="numeric"
            />

            <TextInput
                placeholder="Category"
                value={category}
                onChangeText={setCategory}
                style={styles.input}
            />

            <TextInput
                placeholder="Location (City)"
                value={locationCity}
                onChangeText={setLocationCity}
                style={styles.input}
            />

            <TextInput
                placeholder="Item Condition"
                value={itemCondition}
                onChangeText={setItemCondition}
                style={styles.input}
            />

            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
                {['active', 'inactive', 'sold'].map((s) => (
                    <Button
                        key={s}
                        title={s.charAt(0).toUpperCase() + s.slice(1)}
                        onPress={() => setStatus(s)}
                        color={status === s ? '#2563EB' : '#9CA3AF'}
                    />
                ))}
            </View>

            <View style={styles.buttonRow}>
                <Button title="Cancel" onPress={() => navigation.goBack()} color="#6B7280" />
                <Button
                    title={loading ? 'Saving...' : 'Save Changes'}
                    onPress={updateListing}
                    disabled={loading}
                />
            </View>

            <View style={styles.deleteSection}>
                <Button
                    title="Delete Listing"
                    onPress={deleteListing}
                    color="#DC2626"
                    disabled={loading}
                />
            </View>
                </ScrollView>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f5f5',
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        backgroundColor: '#fff',
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 16,
        marginBottom: 16,
    },
    deleteSection: {
        marginTop: 16,
        marginBottom: 32,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    // Image styles
    imageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    imageWrapper: {
        position: 'relative',
        width: 90,
        height: 90,
    },
    imageThumb: {
        width: 90,
        height: 90,
        borderRadius: 8,
        backgroundColor: '#E5E7EB',
    },
    removeBadge: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#DC2626',
        alignItems: 'center',
        justifyContent: 'center',
    },
    removeBadgeText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 16,
    },
    newBadge: {
        position: 'absolute',
        bottom: 2,
        left: 2,
        backgroundColor: '#F59E0B',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
    },
    newBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: 'bold',
    },
    imageButtons: {
        flexDirection: 'row',
        marginBottom: 16,
    },
});
