import React, { useState, useEffect } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import networkMonitor from '../services/downloadManager/NetworkMonitor';

import HomeScreen from '../screens/HomeScreen';
import VideoPlayerScreen from '../screens/VideoPlayerScreen';
import DetailScreen from '../screens/DetailScreen';
import SearchScreen from '../screens/SearchScreen';
import DownloadsScreen from '../screens/DownloadsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SportStreamsScreen from '../screens/SportStreamsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom tab navigator
const MainTabs = ({ route }) => {
  const initialRoute = route?.params?.initialRoute || 'Home';

  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
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
        name="Downloads"
        component={DownloadsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="download" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" color={color} size={size} />
          )
        }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState('Home');

  useEffect(() => {
    const checkConnectivity = async () => {
      await networkMonitor.start();
      const networkState = networkMonitor.getState();
      if (!networkState.isConnected) {
        setInitialRoute('Downloads');
      }
      setIsLoading(false);
    };
    checkConnectivity();
  }, []);

  if (isLoading) {
    return (
      <View style={navStyles.loadingContainer}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#000',
            borderBottomWidth: 0,
            shadowOpacity: 0,
            elevation: 0,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid,
          cardStyle: { backgroundColor: '#000' },
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
          initialParams={{ initialRoute }}
        />
        <Stack.Screen
          name="VideoPlayer"
          component={VideoPlayerScreen}
          options={{ headerShown: false, autoHideHomeIndicator: true, gestureEnabled: false }}
        />
        <Stack.Screen
          name="DetailScreen"
          component={DetailScreen}
          options={({ route }) => ({
            title: route.params?.title || 'Details',
            headerBackTitle: '',
          })}
        />
        <Stack.Screen
          name="SportStreams"
          component={SportStreamsScreen}
          options={({ route }) => ({
            title: route.params?.sportName || 'Live Streams',
            headerBackTitle: '',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const navStyles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppNavigator;