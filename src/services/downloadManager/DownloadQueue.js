import {
  getDownloadsIndex,
  saveDownloadsIndex,
  saveDownloadEntry,
  updateDownloadEntry,
  removeDownloadEntry,
  createDownloadEntry,
  DOWNLOAD_STATUS,
} from '../../utils/downloadStorage';

class DownloadQueue {
  constructor() {
    this.items = [];
    this.listeners = new Set();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    await this.restore();
    this.initialized = true;
  }

  async restore() {
    try {
      const index = await getDownloadsIndex();
      this.items = Object.values(index.downloads).filter(
        item =>
          item.status === DOWNLOAD_STATUS.QUEUED ||
          item.status === DOWNLOAD_STATUS.DOWNLOADING ||
          item.status === DOWNLOAD_STATUS.PAUSED
      );
      this.items.sort((a, b) => new Date(a.queuedAt) - new Date(b.queuedAt));
      this.notifyListeners();
    } catch (error) {
      this.items = [];
    }
  }

  async enqueue(mediaInfo) {
    const existingItem = this.items.find(item => item.id === mediaInfo.id);
    if (existingItem) {
      if (existingItem.status === DOWNLOAD_STATUS.FAILED) {
        await this.remove(existingItem.id);
      } else {
        throw new Error('Item already in queue');
      }
    }

    const entry = typeof mediaInfo.id === 'string' && mediaInfo.status
      ? mediaInfo
      : createDownloadEntry(mediaInfo);

    entry.status = DOWNLOAD_STATUS.QUEUED;
    entry.queuedAt = new Date().toISOString();
    entry.retryCount = 0;
    entry.errorMessage = null;

    await saveDownloadEntry(entry);
    this.items.push(entry);
    this.notifyListeners();

    return entry;
  }

  async enqueueBatch(mediaInfoArray) {
    const entries = [];
    for (const mediaInfo of mediaInfoArray) {
      try {
        const entry = await this.enqueue(mediaInfo);
        entries.push(entry);
      } catch (error) {
        // Skip items that fail to enqueue
      }
    }
    return entries;
  }

  getNext() {
    return this.items.find(item => item.status === DOWNLOAD_STATUS.QUEUED) || null;
  }

  getAll() {
    return [...this.items];
  }

  getById(id) {
    return this.items.find(item => item.id === id) || null;
  }

  getQueuedItems() {
    return this.items.filter(item => item.status === DOWNLOAD_STATUS.QUEUED);
  }

  getDownloadingItems() {
    return this.items.filter(item => item.status === DOWNLOAD_STATUS.DOWNLOADING);
  }

  getPausedItems() {
    return this.items.filter(item => item.status === DOWNLOAD_STATUS.PAUSED);
  }

  async updateStatus(id, status, additionalData = {}) {
    try {
      const item = this.items.find(i => i.id === id);
      if (item) {
        item.status = status;
        Object.assign(item, additionalData);

        if (status === DOWNLOAD_STATUS.DOWNLOADING && !item.startedAt) {
          item.startedAt = new Date().toISOString();
        }
        if (status === DOWNLOAD_STATUS.COMPLETED) {
          item.completedAt = new Date().toISOString();
          item.progress = 100;
        }

        await updateDownloadEntry(id, { status, ...additionalData });
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async updateProgress(id, progress, downloadedBytes = 0, totalBytes = 0) {
    try {
      const item = this.items.find(i => i.id === id);
      if (item) {
        item.progress = progress;
        item.downloadedBytes = downloadedBytes;
        item.totalBytes = totalBytes;

        await updateDownloadEntry(id, { progress, downloadedBytes, totalBytes });
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async markCompleted(id, fileSize = 0, filePath = null) {
    try {
      const updates = {
        status: DOWNLOAD_STATUS.COMPLETED,
        completedAt: new Date().toISOString(),
        progress: 100,
        fileSize,
      };
      if (filePath) {
        updates.filePath = filePath;
      }

      const item = this.items.find(i => i.id === id);
      if (item) {
        Object.assign(item, updates);
        await updateDownloadEntry(id, updates);
        this.items = this.items.filter(i => i.id !== id);
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async markFailed(id, errorMessage = 'Unknown error') {
    try {
      const item = this.items.find(i => i.id === id);
      if (item) {
        item.status = DOWNLOAD_STATUS.FAILED;
        item.errorMessage = errorMessage;
        item.retryCount = (item.retryCount || 0) + 1;

        await updateDownloadEntry(id, {
          status: DOWNLOAD_STATUS.FAILED,
          errorMessage,
          retryCount: item.retryCount,
        });

        this.items = this.items.filter(i => i.id !== id);
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async pause(id) {
    return this.updateStatus(id, DOWNLOAD_STATUS.PAUSED);
  }

  async resume(id) {
    return this.updateStatus(id, DOWNLOAD_STATUS.QUEUED);
  }

  async remove(id) {
    try {
      await removeDownloadEntry(id);
      this.items = this.items.filter(item => item.id !== id);
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  async clear() {
    try {
      for (const item of this.items) {
        await removeDownloadEntry(item.id);
      }
      this.items = [];
      this.notifyListeners();
      return true;
    } catch (error) {
      return false;
    }
  }

  getQueueLength() {
    return this.items.length;
  }

  getQueuedCount() {
    return this.getQueuedItems().length;
  }

  isInQueue(id) {
    return this.items.some(item => item.id === id);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  notifyListeners() {
    const items = this.getAll();
    this.listeners.forEach(callback => {
      try {
        callback(items);
      } catch (error) {
        // Listener error, ignore
      }
    });
  }
}

const downloadQueue = new DownloadQueue();
export default downloadQueue;
