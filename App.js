import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { checkForUpdates, getCheckForUpdatesSetting } from './src/utils/updateChecker';

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      const updatesEnabled = await getCheckForUpdatesSetting();
      if (updatesEnabled) {
        await checkForUpdates(false);
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
