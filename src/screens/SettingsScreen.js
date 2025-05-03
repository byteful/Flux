import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { clearStreamCache, saveAutoPlaySetting, getAutoPlaySetting } from '../utils/storage'; // Import storage functions

const THEME_KEY = 'app_theme';
// const AUTO_PLAY_KEY = 'auto_play'; // No longer needed here, managed in storage.js

const SettingsScreen = () => {
  const [autoPlayNext, setAutoPlayNext] = useState(false); // Default to false, will be loaded
  const [loading, setLoading] = useState(true);
  const [watchHistory, setWatchHistory] = useState(0);
  const [streamCacheCount, setStreamCacheCount] = useState(0); // State for stream cache count
  const [storageUsageValue, setStorageUsageValue] = useState(0); // State for storage value
  const [storageUsageUnit, setStorageUsageUnit] = useState('KB'); // State for storage unit (KB/MB)
  const opacity = useSharedValue(0); // Animated value

  // Animated style
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  useEffect(() => {
    // Load saved settings and calculate storage
    const loadSettingsAndStorage = async () => {
      try {
        setLoading(true);

        // Load autoplay setting using the new function
        const isAutoPlayEnabled = await getAutoPlaySetting();
        setAutoPlayNext(isAutoPlayEnabled);

        // Get watch history count
        const watchDataString = await AsyncStorage.getItem('continueWatching');
        const watchData = watchDataString ? JSON.parse(watchDataString) : {};
        setWatchHistory(Object.keys(watchData).length);

        // Get stream cache count
        const streamCacheString = await AsyncStorage.getItem('streamCache');
        const streamCacheData = streamCacheString ? JSON.parse(streamCacheString) : {};
        setStreamCacheCount(Object.keys(streamCacheData).length);

        // Calculate total storage usage
        const allKeys = await AsyncStorage.getAllKeys();
        let totalSize = 0;
        if (allKeys.length > 0) {
          const allData = await AsyncStorage.multiGet(allKeys);
          allData.forEach(([key, value]) => {
            if (value) {
              totalSize += key.length * 2; // Estimate key size (UTF-16)
              totalSize += value.length * 2; // Estimate value size (UTF-16)
            }
          });
        }

        // Determine unit and value
        if (totalSize < 1024 * 1024) { // Less than 1 MB
          setStorageUsageValue((totalSize / 1024).toFixed(2)); // Show in KB
          setStorageUsageUnit('KB');
        } else {
          setStorageUsageValue((totalSize / (1024 * 1024)).toFixed(2)); // Show in MB
          setStorageUsageUnit('MB');
        }

      } catch (error) {
        console.error('Error loading settings or calculating storage:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettingsAndStorage();
  }, []);

  // Function to recalculate storage after clearing cache
  const recalculateStorage = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      let totalSize = 0;
      if (allKeys.length > 0) {
        const allData = await AsyncStorage.multiGet(allKeys);
        allData.forEach(([key, value]) => {
          if (value) {
            totalSize += key.length * 2;
            totalSize += value.length * 2;
          }
        });
      }

      // Determine unit and value
      if (totalSize < 1024 * 1024) { // Less than 1 MB
        setStorageUsageValue((totalSize / 1024).toFixed(2)); // Show in KB
        setStorageUsageUnit('KB');
      } else {
        setStorageUsageValue((totalSize / (1024 * 1024)).toFixed(2)); // Show in MB
        setStorageUsageUnit('MB');
      }
    } catch (error) {
      console.error('Error recalculating storage:', error);
    }
  };

  // Save autoplay setting using the new function
  const handleAutoPlayToggle = async (value) => {
    setAutoPlayNext(value); // Update state immediately for responsiveness
    const success = await saveAutoPlaySetting(value);
    if (!success) {
      // Optionally revert state or show an error if saving failed
      setAutoPlayNext(!value);
      Alert.alert('Error', 'Could not save auto-play setting.');
    }
  };

  // Clear watch history
  const handleClearHistory = () => {
    Alert.alert(
      'Clear Watch History',
      'Are you sure you want to clear your watch history? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('continueWatching');
              setWatchHistory(0);
              Alert.alert('Success', 'Your watch history has been cleared.');
            } catch (error) {
              console.error('Error clearing watch history:', error);
            }
          },
        },
      ]
    );
  };

  // Clear stream cache
  const handleClearStreamCache = () => {
    Alert.alert(
      'Clear Stream Cache',
      'Are you sure you want to clear the cached stream URLs? This might require fetching them again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearStreamCache();
              setStreamCacheCount(0); // Reset count in state
              await recalculateStorage(); // Recalculate storage usage
              Alert.alert('Success', 'Stream cache has been cleared.');
            } catch (error) {
              console.error('Error clearing stream cache:', error);
              Alert.alert('Error', 'Could not clear stream cache.');
            }
          },
        },
      ]
    );
  };

  useFocusEffect(
    useCallback(() => {
      opacity.value = 0; // Reset
      opacity.value = withTiming(1, { duration: 300 }); // Fade in
      return () => {
        // Optional fade out
      };
    }, [opacity])
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Animated.View style={[styles.animatedContainer, animatedStyle]}>
        <ScrollView>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Settings</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Playback</Text>
            <View style={styles.setting}>
              <View style={styles.settingInfo}>
                <Ionicons name="play-skip-forward" size={22} color="#888" style={styles.settingIcon} />
                <Text style={styles.settingTitle}>Auto-play Next Episode</Text>
              </View>
              <Switch
                value={autoPlayNext}
                onValueChange={handleAutoPlayToggle}
                trackColor={{ false: '#444', true: '#E50914' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data & Privacy</Text>
            <View style={styles.dataInfo}>
              <Ionicons name="time" size={22} color="#888" style={styles.settingIcon} />
              <View style={styles.watchHistoryContainer}>
                <Text style={styles.settingTitle}>Watch History</Text>
                <Text style={styles.watchHistoryCount}>
                  {watchHistory} {watchHistory === 1 ? 'item' : 'items'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.button} onPress={handleClearHistory}>
              <Text style={styles.buttonText}>Clear Watch History</Text>
            </TouchableOpacity>

            {/* Stream Cache Info */}
            <View style={[styles.dataInfo, { marginTop: 10 }]}>
              <Ionicons name="cloud-download" size={22} color="#888" style={styles.settingIcon} />
              <View style={styles.watchHistoryContainer}>
                <Text style={styles.settingTitle}>Cached Stream URLs</Text>
                <Text style={styles.watchHistoryCount}>
                  {streamCacheCount} {streamCacheCount === 1 ? 'URL' : 'URLs'}
                </Text>
              </View>
            </View>

            {/* Clear Stream Cache Button */}
            <TouchableOpacity style={styles.button} onPress={handleClearStreamCache}>
              <Text style={styles.buttonText}>Clear Stream Cache</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Build</Text>
              <Text style={styles.infoValue}>2025.1</Text>
            </View>
            {/* Storage Usage Info */}
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Storage Used</Text>
              <Text style={styles.infoValue}>{storageUsageValue} {storageUsageUnit}</Text>
            </View>
          </View>
        </ScrollView>

      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  animatedContainer: { // Add style for the animated wrapper
    flex: 1,
    backgroundColor: '#000', // Match screen background
  },
  container: {
    flex: 1,
    // backgroundColor: '#000', // Background is now on animatedContainer
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  section: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  sectionTitle: {
    color: '#E50914',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
  },
  setting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    marginRight: 12,
  },
  settingTitle: {
    color: '#fff',
    fontSize: 16,
  },
  dataInfo: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  watchHistoryContainer: {
    flex: 1,
  },
  watchHistoryCount: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  button: {
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  infoLabel: {
    color: '#888',
    fontSize: 16,
  },
  infoValue: {
    color: '#fff',
    fontSize: 16,
  },
});

export default SettingsScreen;