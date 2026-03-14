import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import HomeScreen from '../screens/HomeScreen';
import MyListingsScreen from '../screens/MyListingsScreen';
import CreateListingScreen from '../screens/CreateListingScreen';
import EditListingScreen from '../screens/EditListingScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import ChatScreen from '../screens/ChatScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator id="MainStack">
        {user ? (
          // Authenticated — show main app screens
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="MyListings" component={MyListingsScreen} options={{ title: 'My Listings' }} />
            <Stack.Screen name="CreateListing" component={CreateListingScreen} />
            <Stack.Screen name="EditListing" component={EditListingScreen} />
            <Stack.Screen name="Conversations" component={ConversationsScreen} options={{ title: 'Messages' }} />
            <Stack.Screen name="Chat" component={ChatScreen} />
          </>
        ) : (
          // Not authenticated — show auth screens
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SignUp"
              component={SignUpScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}