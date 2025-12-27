import * as FileSystem from 'expo-file-system';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import storageManager from './StorageManager';
import { ensureDirectoryExists } from '../../utils/downloadStorage';
import ffmpegConverter from './FFmpegConverter';

class HLSDownloader {
  constructor(entry, onProgress, onComplete, onError) {
    this.entry = entry;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError;

    this.segments = [];
    this.initSegment = null;
    this.downloadedSegments = 0;
    this.totalSegments = 0;
    this.isPaused = false;
    this.isCancelled = false;
    this.contentDir = entry.filePath;
    this.segmentsDir = `${this.contentDir}segments/`;
    this.totalBytesDownloaded = 0;
    this.concurrentDownloads = 5;
    this.failedSegments = [];
    this.lastProgressTime = Date.now();
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

      let variantParsed;
      let playlistInfo;
      if (parsedPlaylist.isMaster) {
        const selectedVariant = this.selectBestVariant(parsedPlaylist.variants);
        if (!selectedVariant) {
          throw new Error('No suitable video quality found in master playlist');
        }

        const variantContent = await this.fetchPlaylist(selectedVariant.url);
        if (this.isCancelled) return;

        variantParsed = this.parsePlaylist(variantContent, selectedVariant.url);
        this.segments = variantParsed.segments;
        this.initSegment = variantParsed.initSegment;
        playlistInfo = variantParsed;
      } else {
        this.segments = parsedPlaylist.segments;
        this.initSegment = parsedPlaylist.initSegment;
        playlistInfo = parsedPlaylist;
      }

      this.totalSegments = this.segments.length;
      const expectedDurationMinutes = Math.round(playlistInfo.totalDuration / 60);

      if (this.totalSegments === 0) {
        throw new Error('No segments found in playlist');
      }

      if (!playlistInfo.isVOD && expectedDurationMinutes < 30) {
        console.warn(`[HLSDownloader] Warning: Playlist may be live/sliding window (no EXT-X-ENDLIST, duration: ${expectedDurationMinutes}min)`);
        console.warn(`[HLSDownloader] The source may not provide full VOD content. Consider using a different source.`);
      }

      if (playlistInfo.isVOD && expectedDurationMinutes < 15) {
        console.warn(`[HLSDownloader] Warning: VOD playlist has unusually short duration: ${expectedDurationMinutes} minutes`);
      }

      this.reportProgress(5, 'downloading');

      if (this.initSegment) {
        await this.downloadInitSegment();
        if (this.isCancelled) return;
      }

      // Pre-process byte ranges
      let lastByteRangeEnd = 0;
      for (let i = 0; i < this.segments.length; i++) {
        const segment = this.segments[i];
        if (segment.byteRange && segment.byteRange.offset === null) {
          segment.byteRange.offset = lastByteRangeEnd;
        }
        if (segment.byteRange) {
          lastByteRangeEnd = segment.byteRange.offset + segment.byteRange.length;
        }
      }

      // Download segments concurrently in batches
      await this.downloadSegmentsConcurrently();

      // Log any failed segments
      if (this.failedSegments.length > 0) {
        console.warn(`[HLSDownloader] ${this.failedSegments.length} segments failed to download: ${this.failedSegments.slice(0, 10).join(', ')}${this.failedSegments.length > 10 ? '...' : ''}`);
      }

      // Check if too many segments failed
      const failureRate = this.failedSegments.length / this.totalSegments;
      if (failureRate > 0.1) {
        throw new Error(`Too many segments failed to download (${this.failedSegments.length}/${this.totalSegments}). The stream source may be unavailable.`);
      }

      if (this.isCancelled) return;

      this.reportProgress(95, 'converting');

      const mp4Path = `${this.contentDir}video.mp4`;

      try {
        const conversionResult = await ffmpegConverter.convertHLSToMP4(
          this.segmentsDir,
          mp4Path,
          (progressData) => {
            this.reportProgress(95, 'converting');
          }
        );

        if (this.isCancelled) return;

        if (conversionResult.success) {
          await this.cleanupHLSFiles();

          this.reportProgress(100, 'completed');

          if (this.onComplete) {
            this.onComplete({
              filePath: conversionResult.filePath,
              fileSize: conversionResult.fileSize,
              segmentCount: this.totalSegments,
            });
          }
        } else if (conversionResult.cancelled) {
          if (conversionResult.cancelledDueToBackground) {
            if (this.onError) {
              this.onError(new Error('Conversion paused - app went to background. Please retry when app is active.'));
            }
          }
        }
      } catch (conversionError) {
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
      }
    } catch (error) {
      if (this.onError && !this.isCancelled) {
        this.onError(error);
      }
    }
  }

  async cleanupHLSFiles() {
    try {
      const segmentsDirClean = this.segmentsDir.replace('file://', '');
      await LegacyFileSystem.deleteAsync(segmentsDirClean, { idempotent: true });

      const m3u8Path = `${this.contentDir}video.m3u8`.replace('file://', '');
      await LegacyFileSystem.deleteAsync(m3u8Path, { idempotent: true });
    } catch (error) {
      // Ignore cleanup errors
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
      initSegment: null,
      isVOD: false,
      totalDuration: 0,
    };

    let currentSegmentDuration = 0;
    let expectingSegmentUrl = false;
    let currentByteRange = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('#EXT-X-ENDLIST')) {
        result.isVOD = true;
        continue;
      }

      if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
        if (line.includes('VOD')) {
          result.isVOD = true;
        }
        continue;
      }

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
        continue;
      }

      if (line.startsWith('#EXT-X-MAP:')) {
        const uri = this.extractAttribute(line, 'URI');
        if (uri) {
          result.initSegment = {
            url: this.resolveUrl(uri, baseUrl),
            byteRange: this.extractAttribute(line, 'BYTERANGE'),
          };
        }
        continue;
      }

      if (line.startsWith('#EXT-X-BYTERANGE:')) {
        const rangeMatch = line.match(/#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?/);
        if (rangeMatch) {
          currentByteRange = {
            length: parseInt(rangeMatch[1]),
            offset: rangeMatch[2] ? parseInt(rangeMatch[2]) : null,
          };
        }
        continue;
      }

      if (line.startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:\s*([\d.]+)/);
        currentSegmentDuration = durationMatch ? parseFloat(durationMatch[1]) : 0;
        expectingSegmentUrl = true;
        continue;
      }

      if (!line.startsWith('#')) {
        if (expectingSegmentUrl || this.isSegmentUrl(line)) {
          result.segments.push({
            url: this.resolveUrl(line, baseUrl),
            duration: currentSegmentDuration,
            index: result.segments.length,
            byteRange: currentByteRange,
          });
          result.totalDuration += currentSegmentDuration;
          currentSegmentDuration = 0;
          expectingSegmentUrl = false;
          currentByteRange = null;
        }
      }
    }

    return result;
  }

  isSegmentUrl(url) {
    if (!url || url.length === 0) return false;

    const segmentExtensions = ['.ts', '.m4s', '.mp4', '.m4v', '.m4a', '.aac', '.fmp4', '.cmfv', '.cmfa'];
    const lowerUrl = url.toLowerCase();

    if (segmentExtensions.some(ext =>
      lowerUrl.endsWith(ext) || lowerUrl.includes(ext + '?') || lowerUrl.includes(ext + '&')
    )) {
      return true;
    }

    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
      const urlWithoutQuery = url.split('?')[0].split('#')[0];
      const lastPathPart = urlWithoutQuery.split('/').pop();
      if (lastPathPart && !lastPathPart.includes('.')) {
        return true;
      }
    }

    return false;
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

  async downloadInitSegment() {
    if (!this.initSegment) return;

    const filename = 'init.mp4';
    const filePath = `${this.segmentsDir}${filename}`;

    const maxRetries = 5;
    const timeoutMs = 15000;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const headers = {};
        if (this.entry.streamReferer) {
          headers['Referer'] = this.entry.streamReferer;
        }
        if (this.initSegment.byteRange) {
          const range = this.parseByteRange(this.initSegment.byteRange);
          if (range) {
            headers['Range'] = `bytes=${range.start}-${range.end}`;
          }
        }

        const result = await this.downloadWithTimeout(
          this.initSegment.url,
          filePath,
          headers,
          timeoutMs
        );

        if (result.status >= 200 && result.status < 300) {
          const file = new File(filePath);
          if (file.exists && file.size > 0) {
            this.totalBytesDownloaded += file.size;
            this.initSegment.localPath = filePath;
            this.initSegment.localFilename = filename;
            return;
          }
        }

        throw new Error(`Init segment download failed with status ${result.status}`);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          await this.delay(1000 * (attempt + 1));
        }
      }
    }

    throw new Error(`Failed to download init segment after ${maxRetries} attempts: ${lastError?.message}`);
  }

  parseByteRange(byteRangeStr) {
    if (!byteRangeStr) return null;
    const match = byteRangeStr.match(/(\d+)(?:@(\d+))?/);
    if (match) {
      const length = parseInt(match[1]);
      const offset = match[2] ? parseInt(match[2]) : 0;
      return { start: offset, end: offset + length - 1 };
    }
    return null;
  }

  async downloadWithTimeout(url, filePath, headers, timeoutMs) {
    const downloadPromise = LegacyFileSystem.downloadAsync(url, filePath, { headers });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Download timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([downloadPromise, timeoutPromise]);
  }

  async downloadSegmentsConcurrently() {
    const segmentIndices = Array.from({ length: this.segments.length }, (_, i) => i);
    let currentIndex = 0;
    let activeDownloads = 0;
    let lastLoggedProgress = 0;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const processNext = async () => {
        while (this.isPaused) {
          await this.delay(500);
          if (this.isCancelled) {
            resolve();
            return;
          }
        }

        if (this.isCancelled) {
          resolve();
          return;
        }

        if (currentIndex >= segmentIndices.length && activeDownloads === 0) {
          resolve();
          return;
        }

        while (activeDownloads < this.concurrentDownloads && currentIndex < segmentIndices.length) {
          if (this.isCancelled) {
            resolve();
            return;
          }

          const segmentIndex = segmentIndices[currentIndex];
          currentIndex++;
          activeDownloads++;

          this.downloadSegmentWithRetry(this.segments[segmentIndex], segmentIndex)
            .then(() => {
              this.downloadedSegments++;
              this.lastProgressTime = Date.now();

              const progress = 5 + ((this.downloadedSegments / this.totalSegments) * 90);
              this.reportProgress(progress, 'downloading');
            })
            .catch((error) => {
              this.failedSegments.push(segmentIndex);
              console.error(`[HLSDownloader] Segment ${segmentIndex} permanently failed: ${error.message}`);
            })
            .finally(() => {
              activeDownloads--;
              processNext();
            });
        }
      };

      // Start initial batch of downloads
      processNext();
    });
  }

  async downloadSegmentWithRetry(segment, index) {
    const extension = segment.byteRange ? '.m4s' : '.ts';
    const filename = `segment_${String(index).padStart(5, '0')}${extension}`;
    const filePath = `${this.segmentsDir}${filename}`;

    const maxRetries = 5;
    const timeoutMs = 15000;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (this.isCancelled) {
        throw new Error('Download cancelled');
      }

      try {
        const headers = {};
        if (this.entry.streamReferer) {
          headers['Referer'] = this.entry.streamReferer;
        }
        if (segment.byteRange) {
          const start = segment.byteRange.offset;
          const end = start + segment.byteRange.length - 1;
          headers['Range'] = `bytes=${start}-${end}`;
        }

        const result = await this.downloadWithTimeout(
          segment.url,
          filePath,
          headers,
          timeoutMs
        );

        if (result.status >= 200 && result.status < 300) {
          const file = new File(filePath);
          if (file.exists && file.size > 0) {
            this.totalBytesDownloaded += file.size;
            segment.localPath = filePath;
            segment.localFilename = filename;
            return;
          }
          throw new Error('Downloaded file is empty or missing');
        }

        if (result.status === 403 || result.status === 401) {
          throw new Error(`Access denied (${result.status}) - stream may have expired`);
        }

        if (result.status === 429) {
          console.warn(`[HLSDownloader] Rate limited on segment ${index}, waiting before retry...`);
          await this.delay(2000 * (attempt + 1));
        }

        throw new Error(`HTTP ${result.status}`);
      } catch (error) {
        lastError = error;
        const isTimeout = error.message.includes('timeout') || error.message.includes('Timeout');
        const isRateLimit = error.message.includes('429');

        if (attempt < maxRetries - 1) {
          let backoffDelay;
          if (isRateLimit) {
            backoffDelay = 2000 * (attempt + 1);
          } else if (isTimeout) {
            backoffDelay = 1000 * (attempt + 1);
          } else {
            backoffDelay = 500 * (attempt + 1);
          }

          if (attempt >= 2) {
            console.warn(`[HLSDownloader] Segment ${index} attempt ${attempt + 1} failed: ${error.message}, retrying in ${backoffDelay}ms...`);
          }

          await this.delay(backoffDelay);
        }
      }
    }

    throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  async createLocalPlaylist() {
    const isFragmentedMp4 = this.initSegment || this.segments.some(s => s.byteRange);

    let playlistContent = '#EXTM3U\n';
    playlistContent += isFragmentedMp4 ? '#EXT-X-VERSION:7\n' : '#EXT-X-VERSION:3\n';
    playlistContent += '#EXT-X-TARGETDURATION:10\n';
    playlistContent += '#EXT-X-MEDIA-SEQUENCE:0\n';

    if (this.initSegment && this.initSegment.localFilename) {
      let initPath = `${this.segmentsDir}${this.initSegment.localFilename}`;
      if (!initPath.startsWith('file://')) {
        initPath = `file://${initPath}`;
      }
      playlistContent += `#EXT-X-MAP:URI="${initPath}"\n`;
    }

    let includedSegments = 0;
    for (const segment of this.segments) {
      // Skip segments that failed to download
      if (!segment.localFilename) continue;

      playlistContent += `#EXTINF:${segment.duration.toFixed(6)},\n`;
      let absoluteSegmentPath = `${this.segmentsDir}${segment.localFilename}`;
      if (!absoluteSegmentPath.startsWith('file://')) {
        absoluteSegmentPath = `file://${absoluteSegmentPath}`;
      }
      playlistContent += `${absoluteSegmentPath}\n`;
      includedSegments++;
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
