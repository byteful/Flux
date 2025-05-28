import axios from 'axios';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const GITHUB_API_URL = 'https://api.github.com/repos/byteful/Flux/releases/latest';
const CURRENT_VERSION = Constants.expoConfig?.version;

const CHECK_FOR_UPDATES_KEY = '@check_for_updates_enabled';

/**
 * Fetches the latest release version from GitHub.
 * @returns {Promise<string|null>} The latest version string or null if an error occurs.
 */
export const getLatestVersion = async () => {
  try {
    const response = await axios.get(GITHUB_API_URL);
    if (response.data && response.data.tag_name) {
      return response.data.tag_name;
    }
    return null;
  } catch (error) {
    console.error('Error fetching latest version from GitHub:', error);
    return null;
  }
};

/**
 * Compares two version strings.
 * @param {string} versionA Current version.
 * @param {string} versionB Latest version from GitHub.
 * @returns {boolean} True if versionB is different from versionA.
 */
const isDifferentVersion = (versionA, versionB) => {
  if (!versionA || !versionB) return false;
  // Normalize GitHub version, often prefixed with 'v'
  const normalizedVersionB = versionB.startsWith('v') ? versionB.substring(1) : versionB;
  return versionA !== normalizedVersionB;
};

/**
 * Checks for updates, and if a new version is found, notifies the user.
 * It also stores the latest checked version to avoid re-notifying for the same version.
 */
export const checkForUpdates = async (showAlert = true) => {
  let isBeta = CURRENT_VERSION.endsWith("-BETA");
  if (isBeta) {
    if (showAlert) {
      Alert.alert(
        'Beta Build',
        `You are on a beta build! You must be on a release to check for updates.`,
        [{ text: 'OK' }]
      );
    }

    return;
  }

  const latestVersionFromGitHub = await getLatestVersion();
  if (latestVersionFromGitHub) {
    if (isDifferentVersion(CURRENT_VERSION, latestVersionFromGitHub)) {
      Alert.alert(
        'Update Available',
        `A new version of Flux (${latestVersionFromGitHub}) is available. You are currently on ${CURRENT_VERSION}.`,
        [
          {
            text: 'Open Update Page',
            onPress: () => Linking.openURL('https://flux.byteful.me').catch(err => console.error("Couldn't load page", err)),
          },
          { text: 'Later', style: 'cancel' },
        ]
      );
    } else if (showAlert) { // Versions are the same
      Alert.alert(
        'Up to Date',
        `You are already on the latest version (${CURRENT_VERSION}).`,
        [{ text: 'OK' }]
      );
    }
  } else if (showAlert) {
    Alert.alert(
      'Update Check Failed',
      'Could not check for updates. Please try again later.',
      [{ text: 'OK' }]
    );
  }
};

/**
 * Gets the "Check for Updates" setting.
 * @returns {Promise<boolean>} True if enabled, false otherwise. Defaults to true.
 */
export const getCheckForUpdatesSetting = async () => {
  try {
    const value = await AsyncStorage.getItem(CHECK_FOR_UPDATES_KEY);
    return value !== null ? JSON.parse(value) : true; // Default to true if not set
  } catch (error) {
    console.error('Error getting check for updates setting:', error);
    return true; // Default to true on error
  }
};

/**
 * Sets the "Check for Updates" setting.
 * @param {boolean} isEnabled
 */
export const setCheckForUpdatesSetting = async (isEnabled) => {
  try {
    await AsyncStorage.setItem(CHECK_FOR_UPDATES_KEY, JSON.stringify(isEnabled));
  } catch (error) {
    console.error('Error setting check for updates setting:', error);
  }
};