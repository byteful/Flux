import { FFmpegKit, FFmpegKitConfig, ReturnCode } from 'ffmpeg-kit-react-native';
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
  }

  initialize() {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  destroy() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.cancelConversion();
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
    if (this.isConverting) {
      throw new Error('Conversion already in progress');
    }

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

      const concatFilePath = `${segmentsDirClean}concat_list.txt`;
      let concatContent = '';
      for (const segmentFile of segmentFiles) {
        concatContent += `file '${segmentsDirClean}${segmentFile}'\n`;
      }

      await LegacyFileSystem.writeAsStringAsync(concatFilePath, concatContent);

      const command = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
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

      await LegacyFileSystem.deleteAsync(concatFilePath, { idempotent: true });

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
        this.isConverting = false;
        this.currentSessionId = null;

        throw new Error('FFmpeg conversion failed: ' + (logs || 'Unknown error'));
      }
    } catch (error) {
      console.error('[FFmpegConverter] Error:', error);
      this.isConverting = false;
      this.currentSessionId = null;
      throw error;
    }
  }

  async getSegmentFiles(segmentsDir) {
    try {
      const contents = await LegacyFileSystem.readDirectoryAsync(segmentsDir);
      const segmentFiles = contents
        .filter(file => file.endsWith('.ts'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/segment_(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/segment_(\d+)/)?.[1] || '0');
          return numA - numB;
        });
      return segmentFiles;
    } catch (error) {
      console.error('[FFmpegConverter] Error reading segments directory:', error);
      return [];
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
