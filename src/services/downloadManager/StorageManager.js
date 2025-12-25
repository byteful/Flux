import * as FileSystem from 'expo-file-system';
import { File, Directory } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
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

      const downloadResumable = LegacyFileSystem.createDownloadResumable(
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

      const result = await LegacyFileSystem.downloadAsync(url, destPath, { headers });
      return {
        success: result.status >= 200 && result.status < 300,
        uri: result.uri,
        status: result.status,
      };
    } catch (error) {
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
      const file = new File(filePath);
      file.write(content);
      return true;
    } catch (error) {
      return false;
    }
  }

  async readFile(filePath) {
    try {
      const file = new File(filePath);
      if (!file.exists) {
        return null;
      }
      return file.text();
    } catch (error) {
      return null;
    }
  }

  async deleteFile(filePath) {
    try {
      const file = new File(filePath);
      if (file.exists) {
        file.delete();
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async deleteDirectory(dirPath) {
    try {
      const dir = new Directory(dirPath);
      if (dir.exists) {
        dir.delete();
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async fileExists(filePath) {
    try {
      const file = new File(filePath);
      return file.exists;
    } catch (error) {
      return false;
    }
  }

  async getFileInfo(filePath) {
    try {
      const file = new File(filePath);
      if (!file.exists) {
        return null;
      }
      return {
        exists: file.exists,
        size: file.size,
        uri: file.uri,
        isDirectory: false
      };
    } catch (error) {
      return null;
    }
  }

  async getDirectoryContents(dirPath) {
    try {
      const dir = new Directory(dirPath);
      if (!dir.exists) {
        return [];
      }
      const contents = dir.list();
      return contents.map(item => item.name);
    } catch (error) {
      return [];
    }
  }

  async getDirectorySize(dirPath) {
    try {
      let totalSize = 0;
      const contents = await this.getDirectoryContents(dirPath);

      for (const item of contents) {
        const itemPath = `${dirPath}/${item}`;
        try {
          const dir = new Directory(itemPath);
          if (dir.exists) {
            totalSize += await this.getDirectorySize(itemPath);
          }
        } catch {
          try {
            const file = new File(itemPath);
            if (file.exists) {
              totalSize += file.size || 0;
            }
          } catch (e) {
            // Skip items that can't be read
          }
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  async getAvailableStorage() {
    try {
      const freeSpace = await LegacyFileSystem.getFreeDiskStorageAsync();
      return freeSpace;
    } catch (error) {
      return 0;
    }
  }

  async getTotalStorage() {
    try {
      const totalSpace = await LegacyFileSystem.getTotalDiskCapacityAsync();
      return totalSpace;
    } catch (error) {
      return 0;
    }
  }

  async copyFile(sourcePath, destPath) {
    try {
      const sourceFile = new File(sourcePath);
      const destFile = new File(destPath);

      const dirPath = destPath.substring(0, destPath.lastIndexOf('/'));
      await ensureDirectoryExists(dirPath);

      sourceFile.copy(destFile);
      return true;
    } catch (error) {
      return false;
    }
  }

  async moveFile(sourcePath, destPath) {
    try {
      const sourceFile = new File(sourcePath);
      const destFile = new File(destPath);

      const dirPath = destPath.substring(0, destPath.lastIndexOf('/'));
      await ensureDirectoryExists(dirPath);

      sourceFile.move(destFile);
      return true;
    } catch (error) {
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
