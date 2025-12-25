import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import {
  getAllDownloads,
  getDownloadSettings,
  deleteDownload,
  DOWNLOAD_STATUS,
} from '../../utils/downloadStorage';

const CLEANUP_TASK_NAME = 'download-cleanup-task';

TaskManager.defineTask(CLEANUP_TASK_NAME, async () => {
  try {
    await cleanupService.runCleanup();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

class CleanupService {
  constructor() {
    this.isRegistered = false;
  }

  async initialize() {
    try {
      await this.registerBackgroundTask();
      this.isRegistered = true;
    } catch (error) {
      // Initialization failed silently
    }
  }

  async registerBackgroundTask() {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted ||
        status === BackgroundTask.BackgroundTaskStatus.Denied) {
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(CLEANUP_TASK_NAME);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(CLEANUP_TASK_NAME, {
        minimumInterval: 60 * 24,
      });
    }
  }

  async runCleanup() {
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
          // Skip failed deletions
        }
      }
    }

    return deletedItems;
  }

  async unregisterBackgroundTask() {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(CLEANUP_TASK_NAME);
      if (isRegistered) {
        await BackgroundTask.unregisterTaskAsync(CLEANUP_TASK_NAME);
      }
      this.isRegistered = false;
    } catch (error) {
      // Unregister failed silently
    }
  }
}

const cleanupService = new CleanupService();
export default cleanupService;
