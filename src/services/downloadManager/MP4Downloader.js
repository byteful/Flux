import * as FileSystem from 'expo-file-system';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { ensureDirectoryExists } from '../../utils/downloadStorage';

const STALL_TIMEOUT_MS = 30000;

class MP4Downloader {
  constructor(entry, onProgress, onComplete, onError) {
    this.entry = entry;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError;

    this.isPaused = false;
    this.isCancelled = false;
    this.downloadResumable = null;
    this.contentDir = entry.filePath;
    this.lastBytesWritten = 0;
    this.lastProgressTime = Date.now();
    this.stallCheckInterval = null;
  }

  async start() {
    try {
      this.isPaused = false;
      this.isCancelled = false;

      await ensureDirectoryExists(this.contentDir);

      const videoPath = `${this.contentDir}video.mp4`;

      const headers = {};
      if (this.entry.streamReferer) {
        headers['Referer'] = this.entry.streamReferer;
      }

      this.reportProgress(0, 'downloading');

      this.downloadResumable = LegacyFileSystem.createDownloadResumable(
        this.entry.streamUrl,
        videoPath,
        { headers },
        (downloadProgress) => {
          if (this.isCancelled) return;

          const { totalBytesExpectedToWrite, totalBytesWritten } = downloadProgress;

          if (totalBytesWritten > this.lastBytesWritten) {
            this.lastBytesWritten = totalBytesWritten;
            this.lastProgressTime = Date.now();
          }

          if (totalBytesExpectedToWrite > 0) {
            const progress = (totalBytesWritten / totalBytesExpectedToWrite) * 100;
            this.reportProgress(progress, 'downloading', totalBytesWritten, totalBytesExpectedToWrite);
          }
        }
      );

      this.startStallDetection();

      const result = await this.downloadResumable.downloadAsync();

      this.clearStallDetection();

      if (this.isCancelled) return;

      if (!result || result.status >= 400) {
        throw new Error(`Download failed with status: ${result?.status || 'unknown'}`);
      }

      const file = new File(videoPath);

      if (!file.exists || file.size === 0) {
        throw new Error('Download completed but file is empty or missing');
      }

      this.reportProgress(100, 'completed');

      if (this.onComplete) {
        this.onComplete({
          filePath: videoPath,
          fileSize: file.size,
        });
      }
    } catch (error) {
      this.clearStallDetection();
      if (this.onError && !this.isCancelled) {
        this.onError(error);
      }
    }
  }

  async pause() {
    this.isPaused = true;
    this.clearStallDetection();
    if (this.downloadResumable) {
      try {
        const savable = await this.downloadResumable.pauseAsync();
        return savable;
      } catch (error) {
        // Pause failed
      }
    }
    return null;
  }

  async resume(savable = null) {
    this.isPaused = false;
    this.lastProgressTime = Date.now();
    this.startStallDetection();
    if (this.downloadResumable) {
      try {
        const result = await this.downloadResumable.resumeAsync();

        if (this.isCancelled) return;

        if (result) {
          const file = new File(result.uri);

          this.reportProgress(100, 'completed');

          if (this.onComplete) {
            this.onComplete({
              filePath: result.uri,
              fileSize: file.size || 0,
            });
          }
        }
      } catch (error) {
        if (this.onError) {
          this.onError(error);
        }
      }
    }
  }

  startStallDetection() {
    this.clearStallDetection();
    this.stallCheckInterval = setInterval(() => {
      if (this.isPaused || this.isCancelled) return;

      const elapsed = Date.now() - this.lastProgressTime;
      if (elapsed > STALL_TIMEOUT_MS) {
        this.clearStallDetection();
        if (this.onError && !this.isCancelled) {
          this.isCancelled = true;
          if (this.downloadResumable) {
            this.downloadResumable.pauseAsync().catch(() => {});
          }
          this.onError(new Error('Download stalled — no progress for 30 seconds'));
        }
      }
    }, 5000);
  }

  clearStallDetection() {
    if (this.stallCheckInterval) {
      clearInterval(this.stallCheckInterval);
      this.stallCheckInterval = null;
    }
  }

  cancel() {
    this.isCancelled = true;
    this.isPaused = false;
    this.clearStallDetection();
    if (this.downloadResumable) {
      this.downloadResumable.pauseAsync().catch(() => {});
    }
  }

  reportProgress(progress, phase, bytesWritten = 0, totalBytes = 0) {
    if (this.onProgress) {
      this.onProgress({
        progress: Math.min(100, Math.max(0, progress)),
        phase,
        bytesDownloaded: bytesWritten,
        totalBytes: totalBytes,
      });
    }
  }
}

export default MP4Downloader;
