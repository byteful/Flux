import * as FileSystem from 'expo-file-system';
import {
  getDownloadsDirectory,
  getContentDirectory,
  ensureDirectoryExists,
  initializeDownloadsDirectory,
} from '../../utils/downloadStorage';

class StorageManager {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    await initializeDownloadsDirectory();
    this.initialized = true;
  }

  async downloadFile(url, destPath, options = {}) {
    const { headers = {}, onProgress } = options;

    try {
      const dirPath = destPath.substring(0, destPath.lastIndexOf('/'));
      await ensureDirectoryExists(dirPath);

      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        destPath,
        { headers },
        (downloadProgress) => {
          if (onProgress && downloadProgress.totalBytesExpectedToWrite > 0) {
            const progress = (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100;
            onProgress({
              progress,
              bytesWritten: downloadProgress.totalBytesWritten,
              totalBytes: downloadProgress.totalBytesExpectedToWrite,
            });
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      return {
        success: true,
        uri: result.uri,
        status: result.status,
      };
    } catch (error) {
      console.error('StorageManager downloadFile error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async downloadFileSimple(url, destPath, headers = {}) {
    try {
      const dirPath = destPath.substring(0, destPath.lastIndexOf('/'));
      await ensureDirectoryExists(dirPath);

      const result = await FileSystem.downloadAsync(url, destPath, { headers });
      return {
        success: result.status >= 200 && result.status < 300,
        uri: result.uri,
        status: result.status,
      };
    } catch (error) {
      console.error('StorageManager downloadFileSimple error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async writeFile(filePath, content) {
    try {
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      await ensureDirectoryExists(dirPath);
      await FileSystem.writeAsStringAsync(filePath, content);
      return true;
    } catch (error) {
      console.error('StorageManager writeFile error:', error);
      return false;
    }
  }

  async readFile(filePath) {
    try {
      const content = await FileSystem.readAsStringAsync(filePath);
      return content;
    } catch (error) {
      console.error('StorageManager readFile error:', error);
      return null;
    }
  }

  async deleteFile(filePath) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
      return true;
    } catch (error) {
      console.error('StorageManager deleteFile error:', error);
      return false;
    }
  }

  async deleteDirectory(dirPath) {
    try {
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(dirPath, { idempotent: true });
      }
      return true;
    } catch (error) {
      console.error('StorageManager deleteDirectory error:', error);
      return false;
    }
  }

  async fileExists(filePath) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      return fileInfo.exists;
    } catch (error) {
      console.error('StorageManager fileExists error:', error);
      return false;
    }
  }

  async getFileInfo(filePath) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath, { size: true });
      return fileInfo;
    } catch (error) {
      console.error('StorageManager getFileInfo error:', error);
      return null;
    }
  }

  async getDirectoryContents(dirPath) {
    try {
      const contents = await FileSystem.readDirectoryAsync(dirPath);
      return contents;
    } catch (error) {
      console.error('StorageManager getDirectoryContents error:', error);
      return [];
    }
  }

  async getDirectorySize(dirPath) {
    try {
      const dirInfo = await FileSystem.getInfoAsync(dirPath, { size: true });
      if (dirInfo.exists && dirInfo.size !== undefined) {
        return dirInfo.size;
      }

      let totalSize = 0;
      const contents = await this.getDirectoryContents(dirPath);

      for (const item of contents) {
        const itemPath = `${dirPath}/${item}`;
        const itemInfo = await FileSystem.getInfoAsync(itemPath, { size: true });
        if (itemInfo.exists) {
          if (itemInfo.isDirectory) {
            totalSize += await this.getDirectorySize(itemPath);
          } else if (itemInfo.size) {
            totalSize += itemInfo.size;
          }
        }
      }

      return totalSize;
    } catch (error) {
      console.error('StorageManager getDirectorySize error:', error);
      return 0;
    }
  }

  async getAvailableStorage() {
    try {
      const freeSpace = await FileSystem.getFreeDiskStorageAsync();
      return freeSpace;
    } catch (error) {
      console.error('StorageManager getAvailableStorage error:', error);
      return 0;
    }
  }

  async getTotalStorage() {
    try {
      const totalSpace = await FileSystem.getTotalDiskCapacityAsync();
      return totalSpace;
    } catch (error) {
      console.error('StorageManager getTotalStorage error:', error);
      return 0;
    }
  }

  async copyFile(sourcePath, destPath) {
    try {
      const dirPath = destPath.substring(0, destPath.lastIndexOf('/'));
      await ensureDirectoryExists(dirPath);
      await FileSystem.copyAsync({ from: sourcePath, to: destPath });
      return true;
    } catch (error) {
      console.error('StorageManager copyFile error:', error);
      return false;
    }
  }

  async moveFile(sourcePath, destPath) {
    try {
      const dirPath = destPath.substring(0, destPath.lastIndexOf('/'));
      await ensureDirectoryExists(dirPath);
      await FileSystem.moveAsync({ from: sourcePath, to: destPath });
      return true;
    } catch (error) {
      console.error('StorageManager moveFile error:', error);
      return false;
    }
  }

  getContentDirectory(mediaType, tmdbId, season = null, episode = null) {
    return getContentDirectory(mediaType, tmdbId, season, episode);
  }

  getDownloadsDirectory() {
    return getDownloadsDirectory();
  }
}

const storageManager = new StorageManager();
export default storageManager;
