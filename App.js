import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { checkForUpdates, getCheckForUpdatesSetting } from './src/utils/updateChecker';
import { initializeStreamSources } from './src/api/vidsrcApi'; // Import the initializer

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      // Initialize stream sources order
      try {
        await initializeStreamSources();
        console.log('[App.js] Stream sources initialized.');
      } catch (error) {
        console.error('[App.js] Failed to initialize stream sources:', error);
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
