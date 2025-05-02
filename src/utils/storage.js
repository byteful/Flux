import AsyncStorage from '@react-native-async-storage/async-storage';

const CONTINUE_WATCHING_KEY = 'continueWatching';
const STREAM_CACHE_KEY = 'streamCache'; // New key for stream cache
const CACHE_EXPIRATION_MS = 1 * 60 * 60 * 1000; // 1 hour expiration

// Save progress for a movie or TV show episode
export const saveWatchProgress = async (contentId, data) => { // Changed mediaId to contentId
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    
    watchData[contentId] = { // Use contentId as key
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
export const getWatchProgress = async (contentId) => { // Changed mediaId to contentId
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    return watchData[contentId] || null; // Use contentId as key
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
    
    // The key in watchData is the contentId
    return Object.entries(watchData)
      .map(([id, data]) => ({ // id here is the contentId
        id, // Keep the contentId as 'id' in the returned object
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
export const removeFromContinueWatching = async (contentId) => { // Changed mediaId to contentId
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    
    delete watchData[contentId]; // Use contentId as key
    await AsyncStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(watchData));
    return true;
  } catch (error) {
    console.error('Error removing from continue watching:', error);
    return false;
  }
};

// --- Stream Cache Functions ---

// Save a stream URL to the cache
export const saveStreamUrl = async (contentId, url) => {
  if (!contentId || !url) return false;
  try {
    const cacheString = await AsyncStorage.getItem(STREAM_CACHE_KEY);
    const cache = cacheString ? JSON.parse(cacheString) : {};
    cache[contentId] = {
      url: url,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(STREAM_CACHE_KEY, JSON.stringify(cache));
    // console.log(`Cached stream URL for ${contentId}`);
    return true;
  } catch (error) {
    console.error('Error saving stream URL to cache:', error);
    return false;
  }
};

// Get a cached stream URL if it's not expired
export const getCachedStreamUrl = async (contentId) => {
  if (!contentId) return null;
  try {
    const cacheString = await AsyncStorage.getItem(STREAM_CACHE_KEY);
    const cache = cacheString ? JSON.parse(cacheString) : {};
    const entry = cache[contentId];

    if (entry && entry.url && entry.timestamp) {
      const isExpired = (Date.now() - entry.timestamp) > CACHE_EXPIRATION_MS;
      if (!isExpired) {
        // console.log(`Using cached stream URL for ${contentId}`);
        return entry.url;
      } else {
        // console.log(`Cached stream URL expired for ${contentId}`);
        // Optionally remove expired entry here
        delete cache[contentId];
        await AsyncStorage.setItem(STREAM_CACHE_KEY, JSON.stringify(cache));
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting cached stream URL:', error);
    return null;
  }
};

// (Optional: Function to clear the entire cache or expired entries)
export const clearStreamCache = async () => {
  try {
    await AsyncStorage.removeItem(STREAM_CACHE_KEY);
    // console.log("Stream cache cleared.");
  } catch (error) {
    console.error('Error clearing stream cache:', error);
  }
};

export default {
  saveWatchProgress,
  getWatchProgress,
  getContinueWatchingList,
  removeFromContinueWatching,
  saveStreamUrl, // Export new function
  getCachedStreamUrl, // Export new function
  clearStreamCache, // Export new function
};