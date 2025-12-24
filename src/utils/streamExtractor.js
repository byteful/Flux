import { getActiveStreamSources, getStreamingUrl as getApiStreamingUrl } from '../api/vidsrcApi';
import { getStreamProcessor } from './streamProcessors';

const _extractStream = (
  sources,
  tmdbId,
  type,
  season,
  episode,
  onStreamFound,
  onSourceError,
  onAllSourcesFailed,
  onManualInterventionRequired,
  provideWebViewConfigForAttempt,
  directUrl = null,
  mediaTitle = null
) => {
  let currentSourceIndex = 0;
  let attemptKey = 0;

  const tryNextSource = () => {
    if (currentSourceIndex >= sources.length) {
      if (onAllSourcesFailed) {
        onAllSourcesFailed(new Error('All stream sources have been attempted.'));
      }
      return;
    }

    const sourceInfo = sources[currentSourceIndex];
    attemptKey++;
    currentSourceIndex++;

    if (sourceInfo.name === "FluxSource") {
      provideWebViewConfigForAttempt(null, sourceInfo.name, `${sourceInfo.name}-${attemptKey}`);
      let fetchUrl;

      if (type === 'tv') {
        fetchUrl = sourceInfo.baseUrl + `?tmdbId=${tmdbId}&season=${season}&episode=${episode}`;
      } else {
        fetchUrl = sourceInfo.baseUrl + `?tmdbId=${tmdbId}`;
      }

      fetch(fetchUrl).then(res => res.json()).then(res => {
        if (res.error || !res.url) {
          tryNextSource();
          return;
        }

        onStreamFound(res.url, res.referer, sourceInfo.name);
      });

      return;
    }

    let embedUrl;
    if (directUrl) {
      embedUrl = directUrl;
    } else {
      embedUrl = getApiStreamingUrl(sourceInfo.baseUrl, tmdbId, type, season, episode, mediaTitle);
    }

    if (!embedUrl) {
      console.error(`[StreamExtractor] Could not generate embed URL for source: ${sourceInfo.name}`);
      if (onSourceError) {
        onSourceError(new Error(`Failed to generate embed URL for ${sourceInfo.name}`), sourceInfo.name);
      }
      tryNextSource();
      return;
    }

    const sourceOrigin = new URL(embedUrl).origin;
    const timeoutInSeconds = sourceInfo.timeoutInSeconds || 10;
    
    const streamProcessor = getStreamProcessor(sourceInfo.name, timeoutInSeconds);
    streamProcessor.setContext({
      type,
      season,
      episode,
      mediaTitle,
      tmdbId
    });
    const injectedJavaScript = streamProcessor.getInjectedJavaScript();

    let attemptConcluded = false;

    const webViewConfig = {
      source: {
        uri: embedUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      },
      injectedJavaScript,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      onMessage: (event) => {
        if (attemptConcluded) return;
        try {
          const data = JSON.parse(event.nativeEvent.data);

          if (data.source !== sourceInfo.name && data.type !== 'debug') {
            return;
          }

          if (data.type === 'debug') {
            console.log(data.message);
          } else if (data.type === 'stream' && data.url) {
            attemptConcluded = true;
            const streamUrl = data.url;
            let streamReferer = data.referer !== undefined ? data.referer : null;
            if (streamReferer) {
              const url = new URL(streamReferer);
              streamReferer = `${url.protocol}//${url.hostname}/`;
            }

            const validationHeaders = {
              'Referer': streamReferer || sourceOrigin + '/'
            };

            fetch(streamUrl, { method: 'GET', headers: validationHeaders })
              .then(response => {
                if (!response.ok) {
                  throw new Error(`Stream URL check failed with status: ${response.status}`);
                }
                if (onStreamFound) {
                  onStreamFound(streamUrl, streamReferer, sourceInfo.name);
                }
              })
              .catch(fetchError => {
                console.error(`[StreamExtractor] Stream URL check failed for ${sourceInfo.name} (${streamUrl}):`, fetchError.message);
                if (onSourceError) {
                  onSourceError(new Error(`Stream check failed: ${fetchError.message}`), sourceInfo.name);
                }
                tryNextSource();
              });
          } else if (data.type === 'stream_candidate') {
            // Can be used for debugging or advanced logic later
          } else if (data.type === 'error') {
            attemptConcluded = true;
            console.error(`[StreamExtractor] Error from WebView JS on ${sourceInfo.name}:`, data.message);
            if (onSourceError) {
              onSourceError(new Error(data.message), sourceInfo.name);
            }
            tryNextSource();
          } else if (data.type === 'skip') {
            attemptConcluded = true;
            tryNextSource();
          }
        } catch (e) {
          if (attemptConcluded) return;
          attemptConcluded = true;
          console.error(`[StreamExtractor] Error parsing WebView message from ${sourceInfo.name}:`, e);
          if (onSourceError) {
            onSourceError(e, sourceInfo.name);
          }
          tryNextSource();
        }
      },
      onError: (syntheticEvent) => {
        if (attemptConcluded) return;
        attemptConcluded = true;
        const { nativeEvent } = syntheticEvent;
        console.error(`[StreamExtractor] WebView onError for ${sourceInfo.name} - ${embedUrl}:`, nativeEvent.description);
        tryNextSource();
      },
      onHttpError: (syntheticEvent) => {
        if (attemptConcluded) return;
        attemptConcluded = true;
        const { nativeEvent } = syntheticEvent;
        console.error(`[StreamExtractor] WebView HTTP error for ${sourceInfo.name} - ${embedUrl}: ${nativeEvent.statusCode}`);
        if (nativeEvent.statusCode === 403 && onManualInterventionRequired) {
          onManualInterventionRequired(embedUrl, sourceInfo.name);
        }
        tryNextSource();
      }
    };

    if (provideWebViewConfigForAttempt) {
      provideWebViewConfigForAttempt(webViewConfig, sourceInfo.name, `${sourceInfo.name}-${attemptKey}`);
    }
  };

  tryNextSource();
};

/**
 * Extract m3u8 stream URL from vidsrc.su embed by trying all available sources.
 * 
 * @param {string} tmdbId - The TMDB ID of the content
 * @param {string} type - The type of content ('movie' or 'tv')
 * @param {number|null} season - The season number (for TV shows)
 * @param {number|null} episode - The episode number (for TV shows)
 * @param {Function} onStreamFound - Callback function when stream URL is found
 * @param {Function} onSourceError - Callback function for errors on a specific source
 * @param {Function} onAllSourcesFailed - Callback when all sources have been attempted
 * @param {Function} onManualInterventionRequired - Callback if manual interaction (e.g. CAPTCHA) is needed
 * @param {Function} provideWebViewConfigForAttempt - Callback to provide the WebView config for rendering
 * @param {string|null} mediaTitle - The title of the media (required for search-based sources like sflix2.to)
 */
export const extractM3U8Stream = (
  tmdbId,
  type,
  season,
  episode,
  onStreamFound,
  onSourceError,
  onAllSourcesFailed,
  onManualInterventionRequired,
  provideWebViewConfigForAttempt,
  mediaTitle = null
) => {
  const activeSources = getActiveStreamSources();
  _extractStream(
    activeSources,
    tmdbId,
    type,
    season,
    episode,
    onStreamFound,
    onSourceError,
    onAllSourcesFailed,
    onManualInterventionRequired,
    provideWebViewConfigForAttempt,
    null,
    mediaTitle
  );
};

/**
 * Extract m3u8 stream URL from a specific source.
 * 
 * @param {Object} sourceInfo - The specific source object { name, baseUrl, timeoutInSeconds }
 * @param {string} tmdbId - The TMDB ID of the content
 * @param {string} type - The type of content ('movie' or 'tv')
 * @param {number|null} season - The season number (for TV shows)
 * @param {number|null} episode - The episode number (for TV shows)
 * @param {Function} onStreamFound - Callback function when stream URL is found
 * @param {Function} onSourceError - Callback function for errors on the source
 * @param {Function} onManualInterventionRequired - Callback if manual interaction is needed
 * @param {Function} provideWebViewConfigForAttempt - Callback to provide the WebView config for rendering
 * @param {string|null} mediaTitle - The title of the media (required for search-based sources like sflix2.to)
 */
export const extractStreamFromSpecificSource = (
  sourceInfo,
  tmdbId,
  type,
  season,
  episode,
  onStreamFound,
  onSourceError,
  onManualInterventionRequired,
  provideWebViewConfigForAttempt,
  mediaTitle = null
) => {
  _extractStream(
    [sourceInfo],
    tmdbId,
    type,
    season,
    episode,
    onStreamFound,
    onSourceError,
    (error) => {
      if (onSourceError) {
        onSourceError(error, sourceInfo.name);
      }
    },
    onManualInterventionRequired,
    provideWebViewConfigForAttempt,
    null,
    mediaTitle
  );
};

/**
 * Extract m3u8 stream URL from a live stream URL (e.g., StreamEast).
 * 
 * @param {string} directUrl - The direct URL to the live stream page
 * @param {string} sourceName - Name of the source (e.g., 'StreamEast')
 * @param {number} timeoutInSeconds - Timeout for stream extraction in seconds
 * @param {Function} onStreamFound - Callback function when stream URL is found
 * @param {Function} onSourceError - Callback function for errors
 * @param {Function} onManualInterventionRequired - Callback if manual interaction is needed
 * @param {Function} provideWebViewConfigForAttempt - Callback to provide the WebView config for rendering
 */
export const extractLiveStream = (
  directUrl,
  sourceName,
  timeoutInSeconds,
  onStreamFound,
  onSourceError,
  onManualInterventionRequired,
  provideWebViewConfigForAttempt
) => {
  const sourceInfo = {
    name: sourceName,
    baseUrl: null,
    timeoutInSeconds: timeoutInSeconds || 15
  };

  _extractStream(
    [sourceInfo],
    null,
    null,
    null,
    null,
    onStreamFound,
    onSourceError,
    (error) => {
      if (onSourceError) {
        onSourceError(error, sourceName);
      }
    },
    onManualInterventionRequired,
    provideWebViewConfigForAttempt,
    directUrl
  );
};

export default {
  extractM3U8Stream,
  extractStreamFromSpecificSource,
  extractLiveStream
};