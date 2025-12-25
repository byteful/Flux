import * as FileSystem from 'expo-file-system';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { ensureDirectoryExists } from '../../utils/downloadStorage';

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

          if (totalBytesExpectedToWrite > 0) {
            const progress = (totalBytesWritten / totalBytesExpectedToWrite) * 100;
            this.reportProgress(progress, 'downloading', totalBytesWritten, totalBytesExpectedToWrite);
          }
        }
      );

      const result = await this.downloadResumable.downloadAsync();

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
      if (this.onError && !this.isCancelled) {
        this.onError(error);
      }
    }
  }

  async pause() {
    this.isPaused = true;
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

  cancel() {
    this.isCancelled = true;
    this.isPaused = false;
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
