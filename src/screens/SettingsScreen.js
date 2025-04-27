import React, { useState, useEffect } from 'react';
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

const THEME_KEY = 'app_theme';
const AUTO_PLAY_KEY = 'auto_play';

const SettingsScreen = () => {
  const [darkTheme, setDarkTheme] = useState(true); // Default to dark theme
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [loading, setLoading] = useState(true);
  const [watchHistory, setWatchHistory] = useState(0);

  useEffect(() => {
    // Load saved settings
    const loadSettings = async () => {
      try {
        setLoading(true);
        
        // Load theme setting
        const themeSetting = await AsyncStorage.getItem(THEME_KEY);
        if (themeSetting !== null) {
          setDarkTheme(themeSetting === 'dark');
        }
        
        // Load autoplay setting
        const autoPlaySetting = await AsyncStorage.getItem(AUTO_PLAY_KEY);
        if (autoPlaySetting !== null) {
          setAutoPlayNext(autoPlaySetting === 'true');
        }
        
        // Get watch history count
        const watchDataString = await AsyncStorage.getItem('continueWatching');
        const watchData = watchDataString ? JSON.parse(watchDataString) : {};
        setWatchHistory(Object.keys(watchData).length);
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, []);
  
  // Save theme setting
  const handleThemeToggle = async (value) => {
    try {
      setDarkTheme(value);
      await AsyncStorage.setItem(THEME_KEY, value ? 'dark' : 'light');
    } catch (error) {
      console.error('Error saving theme setting:', error);
    }
  };
  
  // Save autoplay setting
  const handleAutoPlayToggle = async (value) => {
    try {
      setAutoPlayNext(value);
      await AsyncStorage.setItem(AUTO_PLAY_KEY, value.toString());
    } catch (error) {
      console.error('Error saving autoplay setting:', error);
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Ionicons name="moon" size={22} color="#888" style={styles.settingIcon} />
              <Text style={styles.settingTitle}>Dark Theme</Text>
            </View>
            <Switch
              value={darkTheme}
              onValueChange={handleThemeToggle}
              trackColor={{ false: '#444', true: '#E50914' }}
              thumbColor="#fff"
            />
          </View>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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