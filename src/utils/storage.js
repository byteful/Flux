import AsyncStorage from '@react-native-async-storage/async-storage';

const CONTINUE_WATCHING_KEY = 'continueWatching';

// Save progress for a movie or TV show episode
export const saveWatchProgress = async (mediaId, data) => {
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    
    watchData[mediaId] = {
      ...data,
      lastWatched: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(watchData));
    return true;
  } catch (error) {
    console.error('Error saving watch progress:', error);
    return false;
  }
};

// Get progress for a specific movie or TV show episode
export const getWatchProgress = async (mediaId) => {
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    return watchData[mediaId] || null;
  } catch (error) {
    console.error('Error getting watch progress:', error);
    return null;
  }
};

// Get all continue watching items, sorted by most recently watched
export const getContinueWatchingList = async () => {
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    
    return Object.entries(watchData)
      .map(([id, data]) => ({
        id,
        ...data,
      }))
      .sort((a, b) => {
        return new Date(b.lastWatched) - new Date(a.lastWatched);
      });
  } catch (error) {
    console.error('Error getting continue watching list:', error);
    return [];
  }
};

// Clear a specific item from continue watching
export const removeFromContinueWatching = async (mediaId) => {
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    
    delete watchData[mediaId];
    
    await AsyncStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(watchData));
    return true;
  } catch (error) {
    console.error('Error removing from continue watching:', error);
    return false;
  }
};

export default {
  saveWatchProgress,
  getWatchProgress,
  getContinueWatchingList,
  removeFromContinueWatching,
};