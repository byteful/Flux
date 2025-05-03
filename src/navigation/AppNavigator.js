import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native'; // Import DarkTheme
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack'; // Import CardStyleInterpolators
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, Text } from 'react-native';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import VideoPlayerScreen from '../screens/VideoPlayerScreen';
import DetailScreen from '../screens/DetailScreen';
import SearchScreen from '../screens/SearchScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Main stack navigator that includes screens shared across tabs
const MainStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#000',
          // Remove potential border if it exists
          borderBottomWidth: 0,
          shadowOpacity: 0, // Remove shadow as well
          elevation: 0, // Android shadow
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        // Use a simple fade animation for all transitions in this stack
        cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid,
        // Ensure card background is black during transitions
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      <Stack.Screen 
        name="MainTabs" 
        component={MainTabs} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="VideoPlayer" 
        component={VideoPlayerScreen} 
        options={{ headerShown: false, autoHideHomeIndicator: true }}
      />
      <Stack.Screen 
        name="DetailScreen" 
        component={DetailScreen}
        options={({ route }) => ({
          title: route.params?.title || 'Details',
          headerBackTitle: 'Back', // Add this line
        })}
      />
    </Stack.Navigator>
  );
};

// Bottom tab navigator
const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        // Disable the header for all tab screens
        headerShown: false, 
        tabBarStyle: { 
          backgroundColor: '#000',
          borderTopColor: '#222',
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#777',
        tabBarLabelStyle: {
          fontSize: 12,
        },
        // headerStyle and headerTintColor are no longer needed here
        // headerStyle: {
        //   backgroundColor: '#000',
        // },
        // headerTintColor: '#fff',
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen 
        name="Search" 
        component={SearchScreen} 
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  return (
    // Use the DarkTheme to ensure consistent background
    <NavigationContainer theme={DarkTheme}>
      <MainStack />
    </NavigationContainer>
  );
};

export default AppNavigator;