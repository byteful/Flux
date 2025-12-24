import networkMonitor from './NetworkMonitor';
import storageManager from './StorageManager';
import downloadQueue from './DownloadQueue';
import HLSDownloader from './HLSDownloader';
import MP4Downloader from './MP4Downloader';
import ffmpegConverter from './FFmpegConverter';
import {
  getDownloadSettings,
  initializeDownloadsDirectory,
  updateDownloadEntry,
  getDownloadEntry,
  deleteDownload,
  getAllDownloads,
  getCompletedDownloads,
  DOWNLOAD_STATUS,
  generateDownloadId,
  createDownloadEntry,
  markAsWatched as markDownloadAsWatched,
} from '../../utils/downloadStorage';

class DownloadManager {
  constructor() {
    this.activeDownloads = new Map();
    this.listeners = new Set();
    this.isInitialized = false;
    this.networkUnsubscribe = null;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      await initializeDownloadsDirectory();
      await storageManager.initialize();
      await downloadQueue.initialize();
      await networkMonitor.start();
      ffmpegConverter.initialize();

      this.networkUnsubscribe = networkMonitor.subscribe((state) => {
        this.handleNetworkChange(state);
      });

      this.isInitialized = true;

      this.processQueue();
    } catch (error) {
      console.error('DownloadManager initialization error:', error);
    }
  }

  handleNetworkChange(networkState) {
    if (networkState.isConnected) {
      this.processQueue();
    } else {
      this.pauseAllActive();
    }
  }

  async canDownload() {
    const settings = await getDownloadSettings();
    return networkMonitor.canDownload(settings.wifiOnlyDownload);
  }

  async addToQueue(mediaInfo) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const entry = await downloadQueue.enqueue(mediaInfo);
      this.notifyListeners('queue-updated', downloadQueue.getAll());
      this.processQueue();
      return entry;
    } catch (error) {
      console.error('DownloadManager addToQueue error:', error);
      throw error;
    }
  }

  async addSeasonToQueue(mediaId, title, posterPath, seasonNumber, episodes) {
    const entries = [];

    for (const episode of episodes) {
      try {
        const mediaInfo = {
          mediaType: 'tv',
          tmdbId: mediaId,
          title,
          posterPath,
          season: seasonNumber,
          episode: episode.episode_number,
          episodeTitle: episode.name,
          streamUrl: null,
          streamReferer: null,
        };

        const entry = await this.addToQueue(mediaInfo);
        entries.push(entry);
      } catch (error) {
        console.error(`Failed to queue episode ${episode.episode_number}:`, error);
      }
    }

    return entries;
  }

  async processQueue() {
    if (!await this.canDownload()) {
      return;
    }

    const settings = await getDownloadSettings();
    const availableSlots = settings.maxConcurrentDownloads - this.activeDownloads.size;

    if (availableSlots <= 0) {
      return;
    }

    for (let i = 0; i < availableSlots; i++) {
      const next = downloadQueue.getNext();
      if (!next) break;

      if (!next.streamUrl) {
        this.fetchAndStartDownload(next).catch(error => {
          console.error(`Failed to fetch stream URL for ${next.id}:`, error);
          this.handleError(next.id, error);
        });
        
        continue;
      }

      this.startDownload(next);
    }
  }

  async fetchAndStartDownload(entry) {
    try {
      const { getActiveStreamSources } = require('../../api/vidsrcApi');
      const sources = getActiveStreamSources();
      
      const fluxSource = sources.find(s => s.name === 'FluxSource');
      
      if (!fluxSource) {
        throw new Error('FluxSource not available for downloads');
      }
      
      let fetchUrl;
      if (entry.mediaType === 'tv') {
        fetchUrl = `${fluxSource.baseUrl}?tmdbId=${entry.tmdbId}&season=${entry.season}&episode=${entry.episode}`;
      } else {
        fetchUrl = `${fluxSource.baseUrl}?tmdbId=${entry.tmdbId}`;
      }

      const response = await fetch(fetchUrl);
      const result = await response.json();
      
      if (result.error || !result.url) {
        throw new Error(result.error || 'No stream URL found');
      }

      await this.setStreamUrlForDownload(entry.id, result.url, result.referer);
      
      const updatedEntry = await getDownloadEntry(entry.id);
      if (updatedEntry) {
        this.startDownload(updatedEntry);
      }
    } catch (error) {
      console.error(`Error fetching stream URL for ${entry.id}:`, error);
      throw error;
    }
  }

  async startDownload(entry) {
    if (this.activeDownloads.has(entry.id)) {
      return;
    }

    await downloadQueue.updateStatus(entry.id, DOWNLOAD_STATUS.DOWNLOADING);
    this.notifyListeners('download-started', entry);

    const onProgress = (progressData) => {
      this.handleProgress(entry.id, progressData);
    };

    const onComplete = (result) => {
      this.handleComplete(entry.id, result);
    };

    const onError = (error) => {
      this.handleError(entry.id, error);
    };

    let downloader;

    if (this.isHLS(entry.streamUrl)) {
      downloader = new HLSDownloader(entry, onProgress, onComplete, onError);
    } else {
      downloader = new MP4Downloader(entry, onProgress, onComplete, onError);
    }

    this.activeDownloads.set(entry.id, downloader);
    downloader.start();
  }

  isHLS(url) {
    if (!url) return false;
    return url.includes('.m3u8') || url.includes('m3u8');
  }

  handleProgress(downloadId, progressData) {
    const { progress, bytesDownloaded, totalBytes } = progressData;

    downloadQueue.updateProgress(downloadId, progress, bytesDownloaded, totalBytes);

    this.notifyListeners('download-progress', {
      id: downloadId,
      ...progressData,
    });
  }

  async handleComplete(downloadId, result) {
    this.activeDownloads.delete(downloadId);

    await downloadQueue.markCompleted(downloadId, result.fileSize, result.filePath);

    this.notifyListeners('download-complete', {
      id: downloadId,
      ...result,
    });

    this.processQueue();
  }

  async handleError(downloadId, error) {
    this.activeDownloads.delete(downloadId);

    await downloadQueue.markFailed(downloadId, error.message);

    this.notifyListeners('download-error', {
      id: downloadId,
      error: error.message,
    });

    this.processQueue();
  }

  async pauseDownload(downloadId) {
    const downloader = this.activeDownloads.get(downloadId);
    if (downloader) {
      downloader.pause();
      await downloadQueue.pause(downloadId);
      this.activeDownloads.delete(downloadId);
      this.notifyListeners('download-paused', { id: downloadId });
    }
  }

  async resumeDownload(downloadId) {
    const entry = await getDownloadEntry(downloadId);
    if (entry && entry.status === DOWNLOAD_STATUS.PAUSED) {
      await downloadQueue.resume(downloadId);
      this.notifyListeners('download-resumed', { id: downloadId });
      this.processQueue();
    }
  }

  async cancelDownload(downloadId) {
    const downloader = this.activeDownloads.get(downloadId);
    if (downloader) {
      downloader.cancel();
      this.activeDownloads.delete(downloadId);
    }

    await downloadQueue.remove(downloadId);
    await deleteDownload(downloadId);

    this.notifyListeners('download-cancelled', { id: downloadId });
  }

  async pauseAllActive() {
    for (const [downloadId, downloader] of this.activeDownloads) {
      downloader.pause();
      await downloadQueue.pause(downloadId);
    }
    this.activeDownloads.clear();
    this.notifyListeners('all-paused', {});
  }

  async cancelAllDownloads() {
    for (const [downloadId, downloader] of this.activeDownloads) {
      downloader.cancel();
    }
    this.activeDownloads.clear();
    downloadQueue.clear();
    this.notifyListeners('all-cancelled', {});
  }

  async retryDownload(downloadId) {
    const entry = await getDownloadEntry(downloadId);
    if (entry && entry.status === DOWNLOAD_STATUS.FAILED) {
      await deleteDownload(downloadId);

      const newEntry = await this.addToQueue({
        mediaType: entry.mediaType,
        tmdbId: entry.tmdbId,
        title: entry.title,
        posterPath: entry.posterPath,
        season: entry.season,
        episode: entry.episode,
        episodeTitle: entry.episodeTitle,
        streamUrl: entry.streamUrl,
        streamReferer: entry.streamReferer,
      });

      return newEntry;
    }
    return null;
  }

  async setStreamUrlForDownload(downloadId, streamUrl, streamReferer = null) {
    await updateDownloadEntry(downloadId, { streamUrl, streamReferer });

    const queueItem = downloadQueue.getById(downloadId);
    if (queueItem) {
      queueItem.streamUrl = streamUrl;
      queueItem.streamReferer = streamReferer;
    }

    this.processQueue();
  }

  async markAsWatched(downloadId) {
    return markDownloadAsWatched(downloadId);
  }

  async getDownload(downloadId) {
    return getDownloadEntry(downloadId);
  }

  async getAllDownloads() {
    return getAllDownloads();
  }

  async getCompletedDownloads() {
    return getCompletedDownloads();
  }

  async getActiveDownloads() {
    return downloadQueue.getAll();
  }

  async isDownloaded(mediaType, tmdbId, season = null, episode = null) {
    const downloadId = generateDownloadId(mediaType, tmdbId, season, episode);
    const entry = await getDownloadEntry(downloadId);
    return entry?.status === DOWNLOAD_STATUS.COMPLETED;
  }

  async getDownloadStatus(mediaType, tmdbId, season = null, episode = null) {
    const downloadId = generateDownloadId(mediaType, tmdbId, season, episode);
    const entry = await getDownloadEntry(downloadId);
    return entry?.status || null;
  }

  async getDownloadProgress(mediaType, tmdbId, season = null, episode = null) {
    const downloadId = generateDownloadId(mediaType, tmdbId, season, episode);

    const queueItem = downloadQueue.getById(downloadId);
    if (queueItem) {
      return queueItem.progress;
    }

    const entry = await getDownloadEntry(downloadId);
    return entry?.progress || 0;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('DownloadManager listener error:', error);
      }
    });
  }

  destroy() {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
    }
    networkMonitor.stop();
    ffmpegConverter.destroy();
    this.activeDownloads.clear();
    this.listeners.clear();
    this.isInitialized = false;
  }
}

const downloadManager = new DownloadManager();
export default downloadManager;
