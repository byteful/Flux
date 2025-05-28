import AsyncStorage from '@react-native-async-storage/async-storage';

const CONTINUE_WATCHING_KEY = 'continueWatching';
const EPISODE_PROGRESS_KEY_PREFIX = 'episodeProgress_';
const STREAM_CACHE_KEY = 'streamCache';
const CACHE_EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days expiration
const AUTO_PLAY_KEY = 'autoPlayEnabled';
const SEARCH_HISTORY_KEY = 'searchHistory';
const MAX_SEARCH_HISTORY_ITEMS = 15;

export const saveWatchProgress = async (mediaId, data) => {
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};

    watchData[mediaId] = {
      ...data,
      lastWatched: new Date().toISOString(),
    };

    await AsyncStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(watchData));

    if (data.mediaType === 'tv' && data.season && data.episode) {
      await saveEpisodeWatchProgress(mediaId, data.season, data.episode, {
        position: data.position,
        duration: data.duration,
        lastWatched: watchData[mediaId].lastWatched,
      });
    }
    return true;
  } catch (error) {
    console.error('Error saving watch progress:', error);
    return false;
  }
};

export const getWatchProgress = async (mediaId) => {
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    return watchData[mediaId] || null;
  } catch (error) {
    console.error('Error getting watch progress for continue watching:', error);
    return null;
  }
};

const getEpisodeProgressKey = (mediaId, seasonNumber, episodeNumber) => {
  return `${EPISODE_PROGRESS_KEY_PREFIX}tv_${mediaId}_s${seasonNumber}_e${episodeNumber}`;
};

export const saveEpisodeWatchProgress = async (mediaId, seasonNumber, episodeNumber, progressData) => {
  try {
    const key = getEpisodeProgressKey(mediaId, seasonNumber, episodeNumber);
    const dataToSave = {
      ...progressData,
      lastWatched: progressData.lastWatched || new Date().toISOString(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(dataToSave));
    return true;
  } catch (error) {
    console.error(`Error saving episode watch progress for S${seasonNumber}E${episodeNumber}:`, error);
    return false;
  }
};

export const getEpisodeWatchProgress = async (mediaId, seasonNumber, episodeNumber) => {
  try {
    const key = getEpisodeProgressKey(mediaId, seasonNumber, episodeNumber);
    const progressString = await AsyncStorage.getItem(key);
    return progressString ? JSON.parse(progressString) : null;
  } catch (error) {
    console.error(`Error getting episode watch progress for S${seasonNumber}E${episodeNumber}:`, error);
    return null;
  }
};

export const getShowWatchProgress = async (mediaId) => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const episodeProgressKeys = keys.filter(key => key.startsWith(`${EPISODE_PROGRESS_KEY_PREFIX}tv_${mediaId}_`));
    const progressEntries = await AsyncStorage.multiGet(episodeProgressKeys);
    
    const showProgress = {};
    progressEntries.forEach(([key, value]) => {
      if (value) {
        const parts = key.replace(`${EPISODE_PROGRESS_KEY_PREFIX}tv_${mediaId}_s`, '').split('_e');
        const seasonNumber = parseInt(parts[0], 10);
        const episodeNumber = parseInt(parts[1], 10);
        if (!showProgress[seasonNumber]) {
          showProgress[seasonNumber] = {};
        }
        showProgress[seasonNumber][episodeNumber] = JSON.parse(value);
      }
    });
    return showProgress;
  } catch (error) {
    console.error('Error getting show watch progress:', error);
    return {};
  }
};

export const getContinueWatchingList = async () => {
  try {
    const watchDataString = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    const watchData = watchDataString ? JSON.parse(watchDataString) : {};
    
    // The key in watchData is now the mediaId
    return Object.entries(watchData)
      .map(([mediaId, data]) => ({
        id: mediaId,
        ...data, // data contains the last watched episode details
      }))
      .sort((a, b) => {
        return new Date(b.lastWatched) - new Date(a.lastWatched);
      });
  } catch (error) {
    console.error('Error getting continue watching list:', error);
    return [];
  }
};

// Clear a specific show/movie from continue watching
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
        return entry.url;
      } else {
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

export const clearStreamCache = async () => {
  try {
    await AsyncStorage.removeItem(STREAM_CACHE_KEY);
  } catch (error) {
    console.error('Error clearing stream cache:', error);
  }
};

// --- Auto Play Setting ---

// Save the auto-play setting
export const saveAutoPlaySetting = async (isEnabled) => {
  try {
    await AsyncStorage.setItem(AUTO_PLAY_KEY, JSON.stringify(isEnabled));
    return true;
  } catch (error) {
    console.error('Error saving auto-play setting:', error);
    return false;
  }
};

// Get the auto-play setting
export const getAutoPlaySetting = async () => {
  try {
    const settingString = await AsyncStorage.getItem(AUTO_PLAY_KEY);
    return settingString ? JSON.parse(settingString) : true;
  } catch (error) {
    console.error('Error getting auto-play setting:', error);
    return false;
  }
};

// --- Search History Functions ---

// Save a search query to history
export const saveSearchQuery = async (query) => {
  if (!query || typeof query !== 'string' || !query.trim()) return false;
  const trimmedQuery = query.trim();
  try {
    const historyString = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    let history = historyString ? JSON.parse(historyString) : [];
    // Remove existing entry if it's already there to move it to the top
    history = history.filter(item => item !== trimmedQuery);
    // Add new query to the beginning
    history.unshift(trimmedQuery);
    // Limit history size
    if (history.length > MAX_SEARCH_HISTORY_ITEMS) {
      history = history.slice(0, MAX_SEARCH_HISTORY_ITEMS);
    }
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.error('Error saving search query:', error);
    return false;
  }
};

// Get search history
export const getSearchHistory = async () => {
  try {
    const historyString = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    return historyString ? JSON.parse(historyString) : [];
  } catch (error) {
    console.error('Error getting search history:', error);
    return [];
  }
};

// Remove a specific search query from history
export const removeSearchQuery = async (queryToRemove) => {
  if (!queryToRemove || typeof queryToRemove !== 'string' || !queryToRemove.trim()) return false;
  const trimmedQuery = queryToRemove.trim();
  try {
    const historyString = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    let history = historyString ? JSON.parse(historyString) : [];
    history = history.filter(item => item !== trimmedQuery);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.error('Error removing search query:', error);
    return false;
  }
};

// Clear all search history
export const clearSearchHistory = async () => {
  try {
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing search history:', error);
    return false;
  }
};

export default {
  saveWatchProgress,
  getWatchProgress,
  getContinueWatchingList,
  saveEpisodeWatchProgress,
  getEpisodeWatchProgress,
  getShowWatchProgress,
  removeFromContinueWatching,
  saveStreamUrl,
  getCachedStreamUrl,
  clearStreamCache,
  saveAutoPlaySetting,
  getAutoPlaySetting,
  saveSearchQuery,
  getSearchHistory,
  removeSearchQuery,
  clearSearchHistory,
};