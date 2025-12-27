import { FFmpegKit, FFmpegKitConfig, ReturnCode, Level } from 'ffmpeg-kit-react-native';
import { AppState } from 'react-native';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

class FFmpegConverter {
  constructor() {
    this.isConverting = false;
    this.currentSessionId = null;
    this.appState = AppState.currentState;
    this.appStateSubscription = null;
    this.onProgressCallback = null;
    this.wasCancelledDueToBackground = false;
    this.conversionQueue = [];
    this.isProcessingQueue = false;
  }

  initialize() {
    FFmpegKitConfig.setLogLevel(Level.AV_LOG_QUIET);
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  destroy() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.cancelConversion();
    this.conversionQueue = [];
  }

  handleAppStateChange = (nextAppState) => {
    if (this.appState === 'active' && nextAppState.match(/inactive|background/)) {
      if (this.isConverting) {
        this.wasCancelledDueToBackground = true;
        this.cancelConversion();
      }
    }
    this.appState = nextAppState;
  };

  async convertHLSToMP4(segmentsDir, outputPath, onProgress) {
    return new Promise((resolve, reject) => {
      this.conversionQueue.push({
        segmentsDir,
        outputPath,
        onProgress,
        resolve,
        reject
      });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.conversionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.conversionQueue.length > 0) {
      const job = this.conversionQueue.shift();
      try {
        const result = await this.executeConversion(job.segmentsDir, job.outputPath, job.onProgress);
        job.resolve(result);
      } catch (error) {
        job.reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  async executeConversion(segmentsDir, outputPath, onProgress) {
    this.isConverting = true;
    this.wasCancelledDueToBackground = false;
    this.onProgressCallback = onProgress;

    try {
      const segmentsDirClean = segmentsDir.replace('file://', '');
      const outputPathClean = outputPath.replace('file://', '');

      const segmentFiles = await this.getSegmentFiles(segmentsDirClean);
      if (segmentFiles.length === 0) {
        throw new Error('No segment files found');
      }

      const hasInit = await this.hasInitSegment(segmentsDirClean);
      const isFragmentedMp4 = segmentFiles[0]?.endsWith('.m4s') || hasInit;

      // Create an HLS playlist with discontinuity markers for missing segments
      const playlistPath = `${segmentsDirClean}ffmpeg_playlist.m3u8`;
      let playlistContent = '#EXTM3U\n';
      playlistContent += '#EXT-X-VERSION:3\n';
      playlistContent += '#EXT-X-TARGETDURATION:10\n';
      playlistContent += '#EXT-X-MEDIA-SEQUENCE:0\n';
      playlistContent += '#EXT-X-PLAYLIST-TYPE:VOD\n';

      if (isFragmentedMp4 && hasInit) {
        playlistContent += `#EXT-X-MAP:URI="${segmentsDirClean}init.mp4"\n`;
      }

      // Parse segment numbers and detect gaps
      const segmentNumbers = segmentFiles.map(f => {
        const match = f.match(/segment_(\d+)/);
        return match ? parseInt(match[1]) : -1;
      }).filter(n => n >= 0);

      let lastSegmentNum = -1;
      for (let i = 0; i < segmentFiles.length; i++) {
        const currentNum = segmentNumbers[i];

        // Add discontinuity marker if there's a gap in segment numbers
        if (lastSegmentNum >= 0 && currentNum !== lastSegmentNum + 1) {
          playlistContent += '#EXT-X-DISCONTINUITY\n';
        }

        playlistContent += '#EXTINF:4.5,\n';
        playlistContent += `${segmentsDirClean}${segmentFiles[i]}\n`;
        lastSegmentNum = currentNum;
      }

      playlistContent += '#EXT-X-ENDLIST\n';

      await LegacyFileSystem.writeAsStringAsync(playlistPath, playlistContent);

      // Use HLS demuxer which handles discontinuities properly
      const command = [
        '-allowed_extensions', 'ALL',
        '-i', playlistPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y',
        outputPathClean
      ].join(' ');

      if (onProgress) {
        FFmpegKitConfig.enableStatisticsCallback((statistics) => {
          if (this.onProgressCallback) {
            const time = statistics.getTime();
            this.onProgressCallback({
              time,
              phase: 'converting'
            });
          }
        });
      }

      const session = await FFmpegKit.execute(command);
      this.currentSessionId = session.getSessionId();

      const returnCode = await session.getReturnCode();

      // Clean up playlist file
      await LegacyFileSystem.deleteAsync(playlistPath, { idempotent: true });

      if (ReturnCode.isSuccess(returnCode)) {
        const outputFile = new File(outputPathClean);
        const fileSize = outputFile.exists ? outputFile.size : 0;

        this.isConverting = false;
        this.currentSessionId = null;

        return {
          success: true,
          filePath: outputPath,
          fileSize
        };
      } else if (ReturnCode.isCancel(returnCode)) {
        this.isConverting = false;
        this.currentSessionId = null;

        return {
          success: false,
          cancelled: true,
          cancelledDueToBackground: this.wasCancelledDueToBackground
        };
      } else {
        const logs = await session.getAllLogsAsString();
        console.error(`[FFmpegConverter] Conversion failed:`, logs);
        this.isConverting = false;
        this.currentSessionId = null;

        throw new Error('FFmpeg conversion failed: ' + (logs || 'Unknown error'));
      }
    } catch (error) {
      this.isConverting = false;
      this.currentSessionId = null;
      throw error;
    }
  }

  async getSegmentFiles(segmentsDir) {
    try {
      const contents = await LegacyFileSystem.readDirectoryAsync(segmentsDir);
      const segmentFiles = contents
        .filter(file => file.endsWith('.ts') || file.endsWith('.m4s'))
        .filter(file => file.startsWith('segment_'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/segment_(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/segment_(\d+)/)?.[1] || '0');
          return numA - numB;
        });
      return segmentFiles;
    } catch (error) {
      return [];
    }
  }

  async hasInitSegment(segmentsDir) {
    try {
      const contents = await LegacyFileSystem.readDirectoryAsync(segmentsDir);
      return contents.includes('init.mp4');
    } catch (error) {
      return false;
    }
  }

  async cancelConversion() {
    if (this.currentSessionId) {
      try {
        await FFmpegKit.cancel(this.currentSessionId);
      } catch (error) {
        // Ignore cancellation errors
      }
    }
    this.isConverting = false;
    this.currentSessionId = null;
  }

  getIsConverting() {
    return this.isConverting;
  }
}

const ffmpegConverter = new FFmpegConverter();
export default ffmpegConverter;
