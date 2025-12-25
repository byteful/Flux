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
    this.pendingFetches = new Set();
    this.listeners = new Set();
    this.isInitialized = false;
    this.isProcessingQueue = false;
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
      // Initialization failed
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
      throw error;
    }
  }

  async addSeasonToQueue(mediaId, title, posterPath, seasonNumber, episodes) {
    const entries = [];

    for (const episode of episodes) {
      try {
        const alreadyDownloaded = await this.isDownloaded('tv', mediaId, seasonNumber, episode.episode_number);
        if (alreadyDownloaded) {
          continue;
        }

        const downloadId = generateDownloadId('tv', mediaId, seasonNumber, episode.episode_number);
        const inQueue = downloadQueue.isInQueue(downloadId);
        if (inQueue) {
          continue;
        }

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
        // Skip failed episodes
      }
    }

    return entries;
  }

  async processQueue() {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      if (!await this.canDownload()) {
        return;
      }

      const settings = await getDownloadSettings();
      const currentlyProcessing = this.activeDownloads.size + this.pendingFetches.size;
      const availableSlots = settings.maxConcurrentDownloads - currentlyProcessing;

      if (availableSlots <= 0) {
        return;
      }

      for (let i = 0; i < availableSlots; i++) {
        const next = downloadQueue.getNext();
        if (!next) break;

        if (this.pendingFetches.has(next.id)) {
          continue;
        }

        if (!next.streamUrl) {
          this.pendingFetches.add(next.id);
          this.fetchAndStartDownload(next).catch(error => {
            this.pendingFetches.delete(next.id);
            this.handleError(next.id, error);
          });

          continue;
        }

        await downloadQueue.updateStatus(next.id, DOWNLOAD_STATUS.DOWNLOADING);
        this.startDownload(next);
      }
    } finally {
      this.isProcessingQueue = false;
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

      const timeoutMs = (fluxSource.timeoutInSeconds || 15) * 1000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await fetch(fetchUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      const result = await response.json();

      if (result.error || !result.url) {
        throw new Error(result.error || 'No stream URL found');
      }

      await this.setStreamUrlForDownload(entry.id, result.url, result.referer);

      this.pendingFetches.delete(entry.id);

      await downloadQueue.updateStatus(entry.id, DOWNLOAD_STATUS.DOWNLOADING);

      const updatedEntry = await getDownloadEntry(entry.id);
      if (updatedEntry) {
        this.startDownload(updatedEntry);
      }
    } catch (error) {
      this.pendingFetches.delete(entry.id);
      if (error.name === 'AbortError') {
        throw new Error('Stream URL fetch timed out');
      }
      throw error;
    }
  }

  async startDownload(entry) {
    if (this.activeDownloads.has(entry.id)) {
      return;
    }

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
    this.pendingFetches.clear();
    this.notifyListeners('all-paused', {});
  }

  async cancelAllDownloads() {
    const downloadIds = [];

    for (const [downloadId, downloader] of this.activeDownloads) {
      downloader.cancel();
      downloadIds.push(downloadId);
    }

    const queuedItems = downloadQueue.getAll();
    for (const item of queuedItems) {
      if (!downloadIds.includes(item.id)) {
        downloadIds.push(item.id);
      }
    }

    this.activeDownloads.clear();
    this.pendingFetches.clear();
    await downloadQueue.clear();

    for (const downloadId of downloadIds) {
      await deleteDownload(downloadId);
    }

    this.notifyListeners('all-cancelled', {});
  }

  async cancelAllAndRetry() {
    const itemsToRetry = [];

    for (const [downloadId, downloader] of this.activeDownloads) {
      downloader.cancel();
      const entry = await getDownloadEntry(downloadId);
      if (entry) {
        itemsToRetry.push({
          mediaType: entry.mediaType,
          tmdbId: entry.tmdbId,
          title: entry.title,
          posterPath: entry.posterPath,
          season: entry.season,
          episode: entry.episode,
          episodeTitle: entry.episodeTitle,
          streamUrl: null,
          streamReferer: null,
        });
      }
    }

    const queuedItems = downloadQueue.getAll();
    for (const item of queuedItems) {
      if (!this.activeDownloads.has(item.id)) {
        itemsToRetry.push({
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          title: item.title,
          posterPath: item.posterPath,
          season: item.season,
          episode: item.episode,
          episodeTitle: item.episodeTitle,
          streamUrl: null,
          streamReferer: null,
        });
      }
    }

    this.activeDownloads.clear();
    this.pendingFetches.clear();
    await downloadQueue.clear();

    for (const item of itemsToRetry) {
      const downloadId = generateDownloadId(item.mediaType, item.tmdbId, item.season, item.episode);
      await deleteDownload(downloadId);
    }

    for (const item of itemsToRetry) {
      try {
        await this.addToQueue(item);
      } catch (error) {
        // Skip items that fail to re-queue
      }
    }

    this.notifyListeners('all-retried', { count: itemsToRetry.length });
    return itemsToRetry.length;
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
        // Listener error, ignore
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
    this.pendingFetches.clear();
    this.listeners.clear();
    this.isInitialized = false;
  }
}

const downloadManager = new DownloadManager();
export default downloadManager;
