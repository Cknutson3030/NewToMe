import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import CreateListingScreen from '../screens/CreateListingScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator id="MainStack">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="CreateListing" component={CreateListingScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}