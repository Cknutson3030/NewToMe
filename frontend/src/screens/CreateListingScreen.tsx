import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// API URL for creating listings
const CREATE_URL = 'http://172.16.1.252:3000/listings';

export default function CreateListingScreen({ navigation }: { navigation: any }) {
    // State for form fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState('');
    const [locationCity, setLocationCity] = useState('');
    const [itemCondition, setItemCondition] = useState('');
    const [images, setImages] = useState<any[]>([]);

    // Function to pick images from library
    const pickImages = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert('Permission required', 'Permission to access camera roll is required!');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.7, // Compress to reduce file size (max 5MB on server)
        });

        if (!result.canceled) {
            // Limit to 5 images
            const selectedImages = result.assets.slice(0, 5);
            setImages(selectedImages);
        }
    };

    // Function to take a photo with camera
    const takePhoto = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert('Permission required', 'Permission to access camera is required!');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            quality: 0.7, // Compress to reduce file size (max 5MB on server)
        });

        if (!result.canceled && result.assets.length > 0) {
            // Add to existing images (max 5 total)
            setImages(prev => [...prev, ...result.assets].slice(0, 5));
        }
    };

    // Function to upload images
    const uploadImages = async (listingId: string) => {
        if (images.length === 0) return;

        const formData = new FormData();
        images.forEach((img, i) => {
            const uri = img.uri;
            
            // Try to get MIME type from asset (Expo provides this), or detect from URI
            let mimeType = img.mimeType; // Expo ImagePicker provides this
            
            if (!mimeType || !mimeType.startsWith('image/')) {
                // Fallback: detect from file extension
                const uriParts = uri.split('.');
                const fileExtension = (uriParts[uriParts.length - 1] || 'jpg').toLowerCase().split('?')[0];
                
                const mimeTypes: Record<string, string> = {
                    jpg: 'image/jpeg',
                    jpeg: 'image/jpeg',
                    png: 'image/png',
                    webp: 'image/webp',
                };
                mimeType = mimeTypes[fileExtension] || 'image/jpeg';
            }
            
            // Ensure fileName has proper extension
            const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
            const fileName = img.fileName || `photo_${Date.now()}_${i}.${ext}`;
            
            console.log(`[uploadImages] Image ${i}:`, { uri, fileName, mimeType, assetMime: img.mimeType, assetType: img.type });
            
            formData.append('images', {  
                uri: uri,
                name: fileName,
                type: mimeType,
            } as any);
        });

        try {
            console.log('[uploadImages] Sending to:', `http://172.16.1.252:3000/listings/${listingId}/images`);
            const res = await fetch(`http://172.16.1.252:3000/listings/${listingId}/images`, {
                method: 'POST',
                body: formData,
            });

            const responseText = await res.text();
            console.log('[uploadImages] Response:', res.status, responseText);

            if (res.ok) {
                Alert.alert('Success', 'Images uploaded!');
            } else {
                Alert.alert('Error', `Failed to upload images: ${res.status} - ${responseText}`);
            }
        } catch (err) {
            console.error('[uploadImages] Error:', err);
            Alert.alert('Error', `Network error: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    };

    // Function to create a listing
    const createListing = async () => {
        // Validate title
        if (!title.trim()) {
            Alert.alert('Error', 'Title is required');
            return;
        }

        try {
            const res = await fetch(CREATE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title,
                    description,
                    price: price ? parseFloat(price) : null,
                    category,
                    location_city: locationCity,
                    item_condition: itemCondition,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                Alert.alert('Success', 'Listing created!');
                // Upload images if any
                if (images.length > 0) {
                    await uploadImages(data.data.id);
                }
                // Clear form
                setTitle('');
                setDescription('');
                setPrice('');
                setCategory('');
                setLocationCity('');
                setItemCondition('');
                setImages([]);
                // Go back to home screen
                navigation.goBack();
            } else {
                Alert.alert('Error', 'Failed to create listing');
            }
        } catch (err) {
            Alert.alert('Error', 'Network error');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Create New Listing</Text>

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

            <Button title="Pick Images (Max 5)" onPress={pickImages} />
            <View style={{ marginTop: 8 }}>
                <Button title="Take Photo" onPress={takePhoto} />
            </View>
            {images.length > 0 && (
                <Text style={{ marginTop: 8, marginBottom: 8 }}>Selected {images.length} image(s)</Text>
            )}

            <Button title="Create Listing" onPress={createListing} />
        </View>
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
});
