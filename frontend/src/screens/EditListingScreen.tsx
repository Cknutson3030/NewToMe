import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, ScrollView } from 'react-native';

// API URL for updating listings
const API_BASE_URL = 'http://172.16.1.252:3000';

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

    // Function to update the listing
    const updateListing = async () => {
        // Validate title
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

            // Check if anything changed
            if (Object.keys(payload).length === 0) {
                Alert.alert('No Changes', 'No fields were modified');
                setLoading(false);
                return;
            }

            console.log('[updateListing] Updating listing:', listing.id, payload);

            const res = await fetch(`${API_BASE_URL}/listings/${listing.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                Alert.alert('Success', 'Listing updated!');
                // Go back to home screen
                navigation.goBack();
            } else {
                const errorData = await res.json().catch(() => ({}));
                Alert.alert('Error', errorData.error || `Failed to update listing: ${res.status}`);
            }
        } catch (err) {
            console.error('[updateListing] Error:', err);
            Alert.alert('Error', 'Network error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Edit Listing</Text>

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
        </ScrollView>
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
        marginBottom: 32,
    },
});
