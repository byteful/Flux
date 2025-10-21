import { getActiveStreamSources, getStreamingUrl as getApiStreamingUrl } from '../api/vidsrcApi';

const getInjectedJavaScript = (sourceName, jsTimeout) => `
    (function() {
      const TIMEOUT_MS = ${jsTimeout};
      const CURRENT_SOURCE_NAME = "${sourceName}";
      
      // Store original fetch and XMLHttpRequest to monitor network requests
      const originalFetch = window.fetch;
      const originalXHR = window.XMLHttpRequest;
      let m3u8UrlsFound = []; // Array of { url: string, referer: string | null }
      let mainM3u8Found = false;
      let streamFoundAndPosted = false; // Flag to stop further processing for THIS attempt
      let domScanInterval = null; // To store the interval ID

      // Helper function to wait for elements
      function waitForElement(selector) {
        return new Promise((resolve) => {
          const interval = setInterval(() => {
            if (streamFoundAndPosted) { 
              clearInterval(interval); 
              return; 
            }
            const element = document.querySelector(selector);
            if (element) {
              clearInterval(interval);
              resolve(element);
            }
          }, 100);
        });
      }

      // Helper to post messages, ensuring source name is included
      function postToReactNative(type, message, payload) {
        const fullPayload = { type, message, source: CURRENT_SOURCE_NAME, ...payload };
        if (type === 'debug') {
          window.ReactNativeWebView.postMessage(JSON.stringify({ 
            type: 'debug', 
            message: '[WebViewJS - ' + CURRENT_SOURCE_NAME + '] ' + message, 
            payload: payload ? payload.payload : undefined 
          }));
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify(fullPayload));
        }
      }

      // Wait for iframe and redirect
      waitForElement('#player > iframe').then(iframe => {
        if (streamFoundAndPosted) return;
        window.location.href = iframe.src;
      }).catch(e => postToReactNative('debug', 'Error waiting for #player > iframe', { payload: e.toString() }));

      // Video element handling
      let videoElementInteracted = false;

      waitForElement('video').then(videoElement => {
        if (streamFoundAndPosted) return;

        if (!videoElementInteracted) {
          setTimeout(() => {
            if (streamFoundAndPosted) return;
            try {
              postToReactNative('debug', 'made it', { payload: 'hi' });
              videoElement.play().catch(e => postToReactNative('debug', 'Video play() failed', { payload: e.toString() }));
              videoElement.click();
            } catch (ignored) {}
            videoElementInteracted = true;
          }, 500);
        }

        setTimeout(() => {
          if (streamFoundAndPosted) return;
          const currentSrc = videoElement.src;
          postToReactNative('debug', 'video element src: ' + currentSrc, { payload: currentSrc });
          if (currentSrc && (currentSrc.includes('.m3u8') || currentSrc.includes('.mp4') || CURRENT_SOURCE_NAME.includes('xprime'))) {
            if (!m3u8UrlsFound.some(item => item.url === currentSrc)) {
              const domReferer = (window.location && window.location.href && window.location.href !== 'about:blank') ? window.location.href : null;
              m3u8UrlsFound.push({ url: currentSrc, referer: domReferer });
              if (!mainM3u8Found) {
                mainM3u8Found = true;
                postToReactNative('stream', 'Stream found via video.src', { url: currentSrc, referer: domReferer });
                streamFoundAndPosted = true;
                if (domScanInterval) clearInterval(domScanInterval);
              } else {
                postToReactNative('stream_candidate', 'Candidate via video.src', { url: currentSrc, referer: domReferer });
              }
            }
          }
        }, 1000);
      }).catch(e => postToReactNative('debug', 'Error waiting for video element', { payload: e.toString() }));

      // Wait for play button
      waitForElement("#fixed-container > div.flex.flex-col.items-center.gap-y-3.title-year > button").then(elem => {
        if (streamFoundAndPosted) return;
        setTimeout(() => { if (!streamFoundAndPosted) elem.click(); }, 1000);
      }).catch(e => postToReactNative('debug', 'Error waiting for play button', { payload: e.toString() }));

      // Override fetch
      window.fetch = async function(...args) {
        if (streamFoundAndPosted) return originalFetch.apply(this, args);
        const urlStr = args[0].toString();
        let actualReferer = null;
        try {
          const request = new Request(args[0], args[1]);
          if (request.referrer && request.referrer !== 'about:client' && request.referrer !== '') { 
            actualReferer = request.referrer; 
          } else if (request.referrer === 'about:client') { 
            actualReferer = window.location.href; 
          }
        } catch (e) {
          if (args[1] && args[1].headers) {
            const headers = new Headers(args[1].headers);
            if (headers.has('Referer')) { 
              actualReferer = headers.get('Referer'); 
            }
          }
        }
        postToReactNative('debug', 'Fetch Intercept: URL=' + urlStr, { payload: { referer: actualReferer }});

        if (urlStr.includes('.m3u8') || urlStr.includes('.mp4')) {
          postToReactNative('stream_candidate', 'Candidate via fetch', { url: urlStr, referer: actualReferer });
          if (!mainM3u8Found && (urlStr.includes('master') || urlStr.includes('playlist'))) {
            mainM3u8Found = true;
            postToReactNative('stream', 'Stream found via fetch', { url: urlStr, referer: actualReferer });
            streamFoundAndPosted = true;
            if (domScanInterval) clearInterval(domScanInterval);
          } else if (!m3u8UrlsFound.some(item => item.url === urlStr)) {
            m3u8UrlsFound.push({ url: urlStr, referer: actualReferer });
          }
        }
        return originalFetch.apply(this, args);
      };

      // Override XMLHttpRequest
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        if (streamFoundAndPosted) return xhr;
        const _originalOpen = xhr.open;
        const _originalSetRequestHeader = xhr.setRequestHeader;
        const _originalSend = xhr.send;
        let _urlForM3U8 = null;
        let _capturedRefererHeader = null;

        xhr.open = function(method, url) {
          if (streamFoundAndPosted) return _originalOpen.apply(this, arguments);
          const urlStr = url.toString();
          _capturedRefererHeader = null;
          if (urlStr.includes('.m3u8')) { 
            _urlForM3U8 = urlStr; 
          } else { 
            _urlForM3U8 = null; 
          }
          return _originalOpen.apply(this, arguments);
        };
        
        xhr.setRequestHeader = function(header, value) {
          if (header.toLowerCase() === 'referer') { 
            _capturedRefererHeader = value; 
          }
          return _originalSetRequestHeader.apply(this, arguments);
        };
        
        xhr.send = function() {
          if (streamFoundAndPosted) return _originalSend.apply(this, arguments);
          if (_urlForM3U8) {
            let refererForXhr = _capturedRefererHeader;
            if (!refererForXhr && window.location && window.location.href && window.location.href !== 'about:blank') {
              refererForXhr = window.location.href;
            }
            postToReactNative('debug', 'XHR Intercept: URL=' + _urlForM3U8, { payload: { referer: refererForXhr }});
            postToReactNative('stream_candidate', 'Candidate via XHR', { url: _urlForM3U8, referer: refererForXhr });
            if (!mainM3u8Found && (_urlForM3U8.includes('master') || _urlForM3U8.includes('playlist'))) {
              mainM3u8Found = true;
              postToReactNative('stream', 'Stream found via XHR', { url: _urlForM3U8, referer: refererForXhr });
              streamFoundAndPosted = true;
              if (domScanInterval) clearInterval(domScanInterval);
            } else if (!m3u8UrlsFound.some(item => item.url === _urlForM3U8)) {
              m3u8UrlsFound.push({ url: _urlForM3U8, referer: refererForXhr });
            }
          }
          return _originalSend.apply(this, arguments);
        };
        return xhr;
      };
      
      // Check iframes for streams
      function checkIframes() {
        if (streamFoundAndPosted) return;
        try {
          document.querySelectorAll('iframe').forEach(frame => {
            if (streamFoundAndPosted) return;
            try {
              const iframeWindow = frame.contentWindow;
              if (iframeWindow && iframeWindow.document && !iframeWindow.SKIP_FLUX_INJECTION) {
                iframeWindow.SKIP_FLUX_INJECTION = true; // Prevent re-injection
                const scriptEl = iframeWindow.document.createElement('script');
                scriptEl.textContent = '(function() {' +
                  'const IFRAME_SOURCE_NAME = "' + CURRENT_SOURCE_NAME + '";' +
                  'function postToParent(type, message, payload) {' +
                  '  window.parent.postMessage({ type: type, message: message, source: IFRAME_SOURCE_NAME, ...payload }, "*");' +
                  '}' +
                  'const oFetch = window.fetch;' +
                  'window.fetch = async function(...args) {' +
                  '  const url = args[0].toString();' +
                  '  if (url.includes(".m3u8")) { postToParent("stream", "Stream from iframe fetch", { url: url }); }' +
                  '  return oFetch.apply(this, args);' +
                  '};' +
                  'const oXHR = window.XMLHttpRequest;' +
                  'window.XMLHttpRequest = function() {' +
                  '  const xhr = new oXHR();' +
                  '  const oOpen = xhr.open;' +
                  '  xhr.open = function(m, u) {' +
                  '    if (u.toString().includes(".m3u8")) { postToParent("stream", "Stream from iframe XHR", { url: u.toString() }); }' +
                  '    return oOpen.apply(this, arguments);' +
                  '  };' +
                  '  return xhr;' +
                  '};' +
                  '})();';
                iframeWindow.document.head.appendChild(scriptEl);
              }
            } catch (e) { /* Cross-origin issues */ }
          });
        } catch (e) {}
      }
      
      // Listen for iframe messages
      window.addEventListener('message', function(event) {
        if (streamFoundAndPosted) return;
        if (event.data && event.data.type === 'stream' && event.data.url && event.data.source === CURRENT_SOURCE_NAME) {
          postToReactNative('debug', 'Message from iframe', { payload: event.data });
          if (!mainM3u8Found) {
            mainM3u8Found = true;
            postToReactNative('stream', 'Stream found via iframe message', { url: event.data.url, referer: event.data.referer });
            streamFoundAndPosted = true;
            if (domScanInterval) clearInterval(domScanInterval);
          }
        }
      });

      // DOM scan interval
      domScanInterval = setInterval(function() {
        if (streamFoundAndPosted) { 
          clearInterval(domScanInterval); 
          return; 
        }
        document.querySelectorAll('source, video').forEach(el => {
          if (streamFoundAndPosted) return;
          if (el.src && (el.src.includes('.m3u8') || el.src.includes('moviebox.ng') || el.src.includes(".mp4")) && !m3u8UrlsFound.some(item => item.url === el.src)) {
            const domReferer = (window.location && window.location.href && window.location.href !== 'about:blank') ? window.location.href : null;
            m3u8UrlsFound.push({ url: el.src, referer: domReferer });
            postToReactNative('debug', 'Adding DOM element to candidates', { payload: {url: el.src, referer: domReferer} });
          }
        });
        if (!streamFoundAndPosted) checkIframes();
        if (!streamFoundAndPosted && m3u8UrlsFound.length > 0 && !mainM3u8Found) {
          let bestItem = m3u8UrlsFound.sort((a, b) => b.url.length - a.url.length)[0];
          postToReactNative('stream', 'Posting best fallback stream from DOM scan', { url: bestItem.url, referer: bestItem.referer });
          mainM3u8Found = true;
          streamFoundAndPosted = true;
          clearInterval(domScanInterval);
        }
      }, 1000);
      
      // Timeout handler
      setTimeout(function() {
        if (streamFoundAndPosted) return;
        if (domScanInterval) clearInterval(domScanInterval);
        if (m3u8UrlsFound.length === 0 && !mainM3u8Found) {
          postToReactNative('error', 'No m3u8 stream found after timeout');
        } else if (!mainM3u8Found && m3u8UrlsFound.length > 0) {
          let bestItem = m3u8UrlsFound.sort((a, b) => b.url.length - a.url.length)[0];
          postToReactNative('stream', 'Posting best fallback stream on timeout', { url: bestItem.url, referer: bestItem.referer });
          mainM3u8Found = true; // Mark as found to prevent other logic from firing
        }
        streamFoundAndPosted = true; // Ensure this attempt is marked as concluded
      }, TIMEOUT_MS);
      
      true; // Indicate script execution
    })();
    true;
`;

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
  directUrl = null
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

    let embedUrl;
    if (directUrl) {
      embedUrl = directUrl;
    } else {
      embedUrl = getApiStreamingUrl(sourceInfo.baseUrl, tmdbId, type, season, episode);
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
    const jsTimeout = (sourceInfo.timeoutInSeconds || 10) * 1000;
    
    const injectedJavaScript = getInjectedJavaScript(sourceInfo.name, jsTimeout);

    let attemptConcluded = false;

    const webViewConfig = {
      source: {
        uri: embedUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://v2.streameast.ga/',
        }
      },
      injectedJavaScript,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      onMessage: (event) => {
        if (attemptConcluded) return;
        try {
          const data = JSON.parse(event.nativeEvent.data);

          if (data.source !== sourceInfo.name) {
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
  provideWebViewConfigForAttempt
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
    provideWebViewConfigForAttempt
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
  provideWebViewConfigForAttempt
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
    provideWebViewConfigForAttempt
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