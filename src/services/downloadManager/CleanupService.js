import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import {
  getAllDownloads,
  getDownloadSettings,
  deleteDownload,
  DOWNLOAD_STATUS,
} from '../../utils/downloadStorage';

const CLEANUP_TASK_NAME = 'download-cleanup-task';

class CleanupService {
  constructor() {
    this.isRegistered = false;
  }

  async initialize() {
    try {
      await this.registerBackgroundTask();
      this.isRegistered = true;
    } catch (error) {
      console.error('CleanupService initialization error:', error);
    }
  }

  async registerBackgroundTask() {
    TaskManager.defineTask(CLEANUP_TASK_NAME, async () => {
      try {
        await this.runCleanup();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error('Background cleanup task error:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
        status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.log('Background fetch is not available');
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(CLEANUP_TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(CLEANUP_TASK_NAME, {
        minimumInterval: 60 * 60 * 24,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  }

  async runCleanup() {
    try {
      const settings = await getDownloadSettings();
      const downloads = await getAllDownloads();
      const now = new Date();
      const deletedItems = [];

      for (const download of downloads) {
        if (download.status !== DOWNLOAD_STATUS.COMPLETED) {
          continue;
        }

        let shouldDelete = false;
        let reason = '';

        if (settings.autoDeleteWatchedDays > 0 && download.lastWatchedAt) {
          const watchedDate = new Date(download.lastWatchedAt);
          const daysSinceWatched = (now - watchedDate) / (1000 * 60 * 60 * 24);

          if (daysSinceWatched >= settings.autoDeleteWatchedDays) {
            shouldDelete = true;
            reason = 'watched';
          }
        }

        if (!shouldDelete && settings.autoDeleteUnwatchedDays > 0 && !download.lastWatchedAt) {
          const completedDate = new Date(download.completedAt || download.queuedAt);
          const daysSinceDownload = (now - completedDate) / (1000 * 60 * 60 * 24);

          if (daysSinceDownload >= settings.autoDeleteUnwatchedDays) {
            shouldDelete = true;
            reason = 'unwatched';
          }
        }

        if (shouldDelete) {
          try {
            await deleteDownload(download.id);
            deletedItems.push({ id: download.id, title: download.title, reason });
          } catch (deleteError) {
            console.error(`Failed to delete download ${download.id}:`, deleteError);
          }
        }
      }

      if (deletedItems.length > 0) {
        console.log(`Cleanup: Deleted ${deletedItems.length} downloads:`, deletedItems);
      }

      return deletedItems;
    } catch (error) {
      console.error('CleanupService runCleanup error:', error);
      throw error;
    }
  }

  async unregisterBackgroundTask() {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(CLEANUP_TASK_NAME);
      if (isRegistered) {
        await BackgroundFetch.unregisterTaskAsync(CLEANUP_TASK_NAME);
      }
      this.isRegistered = false;
    } catch (error) {
      console.error('Error unregistering background task:', error);
    }
  }
}

const cleanupService = new CleanupService();
export default cleanupService;
