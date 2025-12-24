import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

const DOWNLOADS_INDEX_KEY = 'downloads_index';
const DOWNLOAD_SETTINGS_KEY = 'download_settings';
const DOWNLOAD_QUEUE_KEY = 'download_queue';

const DOWNLOADS_DIR = `${LegacyFileSystem.documentDirectory}downloads/`;
const DOWNLOADS_BASE_DIR = new Directory(Paths.document, 'downloads');

export const DEFAULT_DOWNLOAD_SETTINGS = {
  wifiOnlyDownload: true,
  maxConcurrentDownloads: 2,
  autoDeleteUnwatchedDays: 14,
  autoDeleteWatchedDays: 0,
};

export const DOWNLOAD_STATUS = {
  QUEUED: 'queued',
  DOWNLOADING: 'downloading',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const generateDownloadId = (mediaType, tmdbId, season = null, episode = null) => {
  if (mediaType === 'tv' && season !== null && episode !== null) {
    return `tv_${tmdbId}_s${season}_e${episode}`;
  }
  return `movie_${tmdbId}`;
};

export const getDownloadsDirectory = () => DOWNLOADS_DIR;

export const getContentDirectory = (mediaType, tmdbId, season = null, episode = null) => {
  if (mediaType === 'tv') {
    return `${DOWNLOADS_DIR}tv/${tmdbId}/s${season}/e${episode}/`;
  }
  return `${DOWNLOADS_DIR}movies/${tmdbId}/`;
};

export const ensureDirectoryExists = async (dirPath) => {
  try {
    const pathParts = dirPath.replace(LegacyFileSystem.documentDirectory, '').split('/').filter(Boolean);
    let currentDir = new Directory(Paths.document);
    
    for (const part of pathParts) {
      currentDir = new Directory(currentDir, part);
      if (!currentDir.exists) {
        currentDir.create();
      }
    }
    return true;
  } catch (error) {
    console.error('Error creating directory:', error);
    return false;
  }
};

export const initializeDownloadsDirectory = async () => {
  try {
    if (!DOWNLOADS_BASE_DIR.exists) {
      DOWNLOADS_BASE_DIR.create();
    }
    
    const moviesDir = new Directory(DOWNLOADS_BASE_DIR, 'movies');
    if (!moviesDir.exists) {
      moviesDir.create();
    }
    
    const tvDir = new Directory(DOWNLOADS_BASE_DIR, 'tv');
    if (!tvDir.exists) {
      tvDir.create();
    }
  } catch (error) {
    console.error('Error initializing downloads directory:', error);
  }
};

export const saveDownloadSettings = async (settings) => {
  try {
    const currentSettings = await getDownloadSettings();
    const newSettings = { ...currentSettings, ...settings };
    await AsyncStorage.setItem(DOWNLOAD_SETTINGS_KEY, JSON.stringify(newSettings));
    return true;
  } catch (error) {
    console.error('Error saving download settings:', error);
    return false;
  }
};

export const getDownloadSettings = async () => {
  try {
    const settingsString = await AsyncStorage.getItem(DOWNLOAD_SETTINGS_KEY);
    if (settingsString) {
      return { ...DEFAULT_DOWNLOAD_SETTINGS, ...JSON.parse(settingsString) };
    }
    return DEFAULT_DOWNLOAD_SETTINGS;
  } catch (error) {
    console.error('Error getting download settings:', error);
    return DEFAULT_DOWNLOAD_SETTINGS;
  }
};

export const getDownloadsIndex = async () => {
  try {
    const indexString = await AsyncStorage.getItem(DOWNLOADS_INDEX_KEY);
    if (indexString) {
      return JSON.parse(indexString);
    }
    return { version: 1, lastUpdated: new Date().toISOString(), downloads: {} };
  } catch (error) {
    console.error('Error getting downloads index:', error);
    return { version: 1, lastUpdated: new Date().toISOString(), downloads: {} };
  }
};

export const saveDownloadsIndex = async (index) => {
  try {
    index.lastUpdated = new Date().toISOString();
    await AsyncStorage.setItem(DOWNLOADS_INDEX_KEY, JSON.stringify(index));
    return true;
  } catch (error) {
    console.error('Error saving downloads index:', error);
    return false;
  }
};

export const getDownloadEntry = async (downloadId) => {
  try {
    const index = await getDownloadsIndex();
    return index.downloads[downloadId] || null;
  } catch (error) {
    console.error('Error getting download entry:', error);
    return null;
  }
};

export const saveDownloadEntry = async (entry) => {
  try {
    const index = await getDownloadsIndex();
    index.downloads[entry.id] = entry;
    await saveDownloadsIndex(index);
    return true;
  } catch (error) {
    console.error('Error saving download entry:', error);
    return false;
  }
};

export const updateDownloadEntry = async (downloadId, updates) => {
  try {
    const index = await getDownloadsIndex();
    if (index.downloads[downloadId]) {
      index.downloads[downloadId] = { ...index.downloads[downloadId], ...updates };
      await saveDownloadsIndex(index);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error updating download entry:', error);
    return false;
  }
};

export const removeDownloadEntry = async (downloadId) => {
  try {
    const index = await getDownloadsIndex();
    if (index.downloads[downloadId]) {
      delete index.downloads[downloadId];
      await saveDownloadsIndex(index);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error removing download entry:', error);
    return false;
  }
};

export const getAllDownloads = async () => {
  try {
    const index = await getDownloadsIndex();
    return Object.values(index.downloads);
  } catch (error) {
    console.error('Error getting all downloads:', error);
    return [];
  }
};

export const getDownloadsByStatus = async (status) => {
  try {
    const downloads = await getAllDownloads();
    return downloads.filter(d => d.status === status);
  } catch (error) {
    console.error('Error getting downloads by status:', error);
    return [];
  }
};

export const getCompletedDownloads = async () => {
  return getDownloadsByStatus(DOWNLOAD_STATUS.COMPLETED);
};

export const getActiveDownloads = async () => {
  try {
    const downloads = await getAllDownloads();
    return downloads.filter(d =>
      d.status === DOWNLOAD_STATUS.QUEUED ||
      d.status === DOWNLOAD_STATUS.DOWNLOADING ||
      d.status === DOWNLOAD_STATUS.PAUSED
    );
  } catch (error) {
    console.error('Error getting active downloads:', error);
    return [];
  }
};

export const isDownloaded = async (mediaType, tmdbId, season = null, episode = null) => {
  try {
    const downloadId = generateDownloadId(mediaType, tmdbId, season, episode);
    const entry = await getDownloadEntry(downloadId);
    return entry?.status === DOWNLOAD_STATUS.COMPLETED;
  } catch (error) {
    console.error('Error checking if downloaded:', error);
    return false;
  }
};

export const getDownloadStatus = async (mediaType, tmdbId, season = null, episode = null) => {
  try {
    const downloadId = generateDownloadId(mediaType, tmdbId, season, episode);
    const entry = await getDownloadEntry(downloadId);
    return entry?.status || null;
  } catch (error) {
    console.error('Error getting download status:', error);
    return null;
  }
};

export const createDownloadEntry = (mediaInfo) => {
  const { mediaType, tmdbId, title, posterPath, season, episode, episodeTitle, streamUrl, streamReferer } = mediaInfo;
  const downloadId = generateDownloadId(mediaType, tmdbId, season, episode);
  const contentDir = getContentDirectory(mediaType, tmdbId, season, episode);

  return {
    id: downloadId,
    tmdbId,
    mediaType,
    title,
    posterPath,
    season: season || null,
    episode: episode || null,
    episodeTitle: episodeTitle || null,
    status: DOWNLOAD_STATUS.QUEUED,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    lastWatchedAt: null,
    filePath: contentDir,
    fileSize: 0,
    streamUrl,
    streamReferer: streamReferer || null,
    errorMessage: null,
    retryCount: 0,
  };
};

export const markAsWatched = async (downloadId) => {
  try {
    await updateDownloadEntry(downloadId, { lastWatchedAt: new Date().toISOString() });
    return true;
  } catch (error) {
    console.error('Error marking as watched:', error);
    return false;
  }
};

export const getDownloadStorageUsage = async () => {
  try {
    if (DOWNLOADS_BASE_DIR.exists) {
      return DOWNLOADS_BASE_DIR.size || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error getting download storage usage:', error);
    return 0;
  }
};

export const deleteDownloadFiles = async (downloadId) => {
  try {
    const entry = await getDownloadEntry(downloadId);
    if (entry && entry.filePath) {
      try {
        const dir = new Directory(entry.filePath);
        if (dir.exists) {
          dir.delete();
        }
      } catch {
        try {
          const file = new File(entry.filePath);
          if (file.exists) {
            file.delete();
          }
        } catch (e) {
          console.warn('Failed to delete with new API, trying legacy:', e);
          await LegacyFileSystem.deleteAsync(entry.filePath, { idempotent: true });
        }
      }
    }
    return true;
  } catch (error) {
    console.error('Error deleting download files:', error);
    return false;
  }
};

export const deleteDownload = async (downloadId) => {
  try {
    await deleteDownloadFiles(downloadId);
    await removeDownloadEntry(downloadId);
    return true;
  } catch (error) {
    console.error('Error deleting download:', error);
    return false;
  }
};

export const clearAllDownloads = async () => {
  try {
    if (DOWNLOADS_BASE_DIR.exists) {
      DOWNLOADS_BASE_DIR.delete();
    }
    await initializeDownloadsDirectory();
    await AsyncStorage.setItem(DOWNLOADS_INDEX_KEY, JSON.stringify({
      version: 1,
      lastUpdated: new Date().toISOString(),
      downloads: {}
    }));
    return true;
  } catch (error) {
    console.error('Error clearing all downloads:', error);
    return false;
  }
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
