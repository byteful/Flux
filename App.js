import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { checkForUpdates, getCheckForUpdatesSetting } from './src/utils/updateChecker';
import { initializeStreamSources } from './src/api/vidsrcApi'; // Import the initializer
import downloadManager, { cleanupService } from './src/services/downloadManager';
import { FLUX_SOURCE_URL } from './src/utils/storage';

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      // Initialize stream sources order
      try {
        await initializeStreamSources();
      } catch (error) {
        console.error('[App.js] Failed to initialize stream sources:', error);
      }

      // Initialize download manager and cleanup service
      try {
        await downloadManager.initialize();
        await cleanupService.initialize();
        fetch(FLUX_SOURCE_URL).catch(ignored => {}); // wake up endpoint early
      } catch (error) {
        console.error('[App.js] Failed to initialize download services:', error);
      }

      // Check for updates
      const updatesEnabled = await getCheckForUpdatesSetting();
      if (updatesEnabled) {
        await checkForUpdates(false); // Assuming false means don't force UI
      }
    };

    initializeApp();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
