import * as FileSystem from 'expo-file-system';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import storageManager from './StorageManager';
import { ensureDirectoryExists } from '../../utils/downloadStorage';

class HLSDownloader {
  constructor(entry, onProgress, onComplete, onError) {
    this.entry = entry;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError;

    this.segments = [];
    this.downloadedSegments = 0;
    this.totalSegments = 0;
    this.isPaused = false;
    this.isCancelled = false;
    this.contentDir = entry.filePath;
    this.segmentsDir = `${this.contentDir}segments/`;
    this.totalBytesDownloaded = 0;
  }

  async start() {
    try {
      this.isPaused = false;
      this.isCancelled = false;

      await ensureDirectoryExists(this.contentDir);
      await ensureDirectoryExists(this.segmentsDir);

      this.reportProgress(0, 'parsing');

      const playlistContent = await this.fetchPlaylist(this.entry.streamUrl);
      if (this.isCancelled) return;

      const parsedPlaylist = this.parsePlaylist(playlistContent, this.entry.streamUrl);

      if (parsedPlaylist.isMaster) {
        const selectedVariant = this.selectBestVariant(parsedPlaylist.variants);
        if (!selectedVariant) {
          throw new Error('No suitable video quality found in master playlist');
        }

        const variantContent = await this.fetchPlaylist(selectedVariant.url);
        if (this.isCancelled) return;

        const variantParsed = this.parsePlaylist(variantContent, selectedVariant.url);
        this.segments = variantParsed.segments;
      } else {
        this.segments = parsedPlaylist.segments;
      }

      this.totalSegments = this.segments.length;

      if (this.totalSegments === 0) {
        throw new Error('No segments found in playlist');
      }

      this.reportProgress(5, 'downloading');

      for (let i = 0; i < this.segments.length; i++) {
        if (this.isCancelled) return;

        while (this.isPaused) {
          await this.delay(500);
          if (this.isCancelled) return;
        }

        await this.downloadSegment(this.segments[i], i);
        this.downloadedSegments++;

        const progress = 5 + ((this.downloadedSegments / this.totalSegments) * 90);
        this.reportProgress(progress, 'downloading');
      }

      if (this.isCancelled) return;

      this.reportProgress(95, 'finalizing');

      const localM3u8Path = await this.createLocalPlaylist();
      const totalSize = await this.calculateTotalSize();

      this.reportProgress(100, 'completed');

      if (this.onComplete) {
        this.onComplete({
          filePath: localM3u8Path,
          fileSize: totalSize,
          segmentCount: this.totalSegments,
        });
      }
    } catch (error) {
      console.error('HLSDownloader error:', error);
      if (this.onError && !this.isCancelled) {
        this.onError(error);
      }
    }
  }

  async fetchPlaylist(url) {
    try {
      const headers = {};
      if (this.entry.streamReferer) {
        headers['Referer'] = this.entry.streamReferer;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch playlist: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      throw new Error(`Failed to fetch playlist: ${error.message}`);
    }
  }

  parsePlaylist(content, baseUrl) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const result = {
      isMaster: false,
      variants: [],
      segments: [],
    };

    let currentSegmentDuration = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        result.isMaster = true;
        const bandwidth = this.extractAttribute(line, 'BANDWIDTH');
        const resolution = this.extractAttribute(line, 'RESOLUTION');

        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith('#')) {
          result.variants.push({
            bandwidth: parseInt(bandwidth) || 0,
            resolution: resolution || 'unknown',
            url: this.resolveUrl(nextLine, baseUrl),
          });
          i++;
        }
      }

      if (line.startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        currentSegmentDuration = durationMatch ? parseFloat(durationMatch[1]) : 0;
      }

      if (!line.startsWith('#') && (line.endsWith('.ts') || line.includes('.ts?') || line.endsWith('.m4s') || currentSegmentDuration > 0)) {
        result.segments.push({
          url: this.resolveUrl(line, baseUrl),
          duration: currentSegmentDuration,
          index: result.segments.length,
        });
        currentSegmentDuration = 0;
      }
    }

    return result;
  }

  extractAttribute(line, attr) {
    const regex = new RegExp(`${attr}=([^,\\s]+|"[^"]*")`);
    const match = line.match(regex);
    if (match) {
      return match[1].replace(/"/g, '');
    }
    return null;
  }

  resolveUrl(relativeUrl, baseUrl) {
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }

    try {
      const base = new URL(baseUrl);
      if (relativeUrl.startsWith('/')) {
        return `${base.protocol}//${base.host}${relativeUrl}`;
      }
      const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
      return basePath + relativeUrl;
    } catch (error) {
      console.error('URL resolution error:', error);
      return relativeUrl;
    }
  }

  selectBestVariant(variants) {
    if (!variants || variants.length === 0) return null;

    const sorted = [...variants].sort((a, b) => b.bandwidth - a.bandwidth);

    const preferred = sorted.find(v => {
      if (v.resolution) {
        const height = parseInt(v.resolution.split('x')[1]);
        return height <= 1080 && height >= 720;
      }
      return true;
    });

    return preferred || sorted[0];
  }

  async downloadSegment(segment, index) {
    const filename = `segment_${String(index).padStart(5, '0')}.ts`;
    const filePath = `${this.segmentsDir}${filename}`;

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const headers = {};
        if (this.entry.streamReferer) {
          headers['Referer'] = this.entry.streamReferer;
        }

        const result = await LegacyFileSystem.downloadAsync(segment.url, filePath, { headers });

        if (result.status >= 200 && result.status < 300) {
          const file = new File(filePath);
          if (file.exists && file.size > 0) {
            this.totalBytesDownloaded += file.size;
            segment.localPath = filePath;
            segment.localFilename = filename;
            return;
          }
        }

        throw new Error(`Download failed with status ${result.status}`);
      } catch (error) {
        lastError = error;
        console.warn(`Segment ${index} download attempt ${attempt + 1} failed:`, error.message);
        if (attempt < maxRetries - 1) {
          await this.delay(1000 * (attempt + 1));
        }
      }
    }

    throw new Error(`Failed to download segment ${index} after ${maxRetries} attempts: ${lastError?.message}`);
  }

  async createLocalPlaylist() {
    let playlistContent = '#EXTM3U\n';
    playlistContent += '#EXT-X-VERSION:3\n';
    playlistContent += '#EXT-X-TARGETDURATION:10\n';
    playlistContent += '#EXT-X-MEDIA-SEQUENCE:0\n';

    for (const segment of this.segments) {
      playlistContent += `#EXTINF:${segment.duration.toFixed(6)},\n`;
      playlistContent += `segments/${segment.localFilename}\n`;
    }

    playlistContent += '#EXT-X-ENDLIST\n';

    const localM3u8Path = `${this.contentDir}video.m3u8`;
    const file = new File(localM3u8Path);
    file.write(playlistContent);

    return localM3u8Path;
  }

  async calculateTotalSize() {
    try {
      const dirInfo = await storageManager.getDirectorySize(this.contentDir);
      return dirInfo || this.totalBytesDownloaded;
    } catch (error) {
      return this.totalBytesDownloaded;
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  cancel() {
    this.isCancelled = true;
    this.isPaused = false;
  }

  reportProgress(progress, phase) {
    if (this.onProgress) {
      this.onProgress({
        progress: Math.min(100, Math.max(0, progress)),
        phase,
        downloadedSegments: this.downloadedSegments,
        totalSegments: this.totalSegments,
        bytesDownloaded: this.totalBytesDownloaded,
      });
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default HLSDownloader;
