import { WebView } from 'react-native-webview';
import { getActiveStreamSources, getStreamingUrl as getApiStreamingUrl } from '../api/vidsrcApi';
import { Platform } from 'react-native';

/**
 * Extract m3u8 stream URL from vidsrc.su embed
 * 
 * @param {string} tmdbId - The TMDB ID of the content
 * @param {string} type - The type of content ('movie' or 'tv')
 * @param {number|null} season - The season number (for TV shows)
 * @param {number|null} episode - The episode number (for TV shows)
 * @param {Function} onStreamFound - Callback function when stream URL is found
 * @param {Function} onError - Callback function for errors
 * @param {Function} onManualInterventionRequired - Callback if manual interaction (e.g. CAPTCHA) is needed
 * @returns {Object} - The WebView instance control object
 */
export const extractM3U8Stream = (
    tmdbId,
    type,
    season,
    episode,
    onStreamFound, // Callback: (url, referer, sourceName) => void
    onSourceError, // Callback: (error, sourceName) => void - error for a specific source
    onAllSourcesFailed, // Callback: (finalError) => void - when all sources exhausted
    onManualInterventionRequired, // Callback: (manualUrl, sourceName) => void
    provideWebViewConfigForAttempt // Callback: (webViewConfig, sourceName, attemptKey) => void
) => {
    let currentSourceIndex = 0;
    let attemptKey = 0; // To help with WebView keying for re-renders
    const activeSources = getActiveStreamSources(); // Get the dynamically ordered sources

    const tryNextSource = () => {
        if (currentSourceIndex >= activeSources.length) {
            if (onAllSourcesFailed) {
                onAllSourcesFailed(new Error('All stream sources have been attempted.'));
            }
            return;
        }

        const sourceInfo = activeSources[currentSourceIndex];
        attemptKey++;
        // const currentAttemptIndex = currentSourceIndex; // Capture index for this attempt - not strictly needed with current logic
        currentSourceIndex++; // Move to next source for the subsequent call

        const embedUrl = getApiStreamingUrl(sourceInfo.baseUrl, tmdbId, type, season, episode);

        if (!embedUrl) {
            console.error(`[StreamExtractor] Could not generate embed URL for source: ${sourceInfo.name}`);
            if (onSourceError) {
                onSourceError(new Error(`Failed to generate embed URL for ${sourceInfo.name}`), sourceInfo.name);
            }
            tryNextSource(); // Try the next one
            return;
        }

        const sourceOrigin = new URL(embedUrl).origin;
        const jsTimeout = (sourceInfo.timeoutInSeconds || 20) * 1000;

        const modifiedInjectedJavaScript = `
        function waitForElement(selector) {
            return new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (streamFoundAndPosted) { clearInterval(interval); return; } // Stop if stream already found by this instance
                    const element = document.querySelector(selector);
                    if (element) {
                        clearInterval(interval);
                        resolve(element);
                    }
                }, 100);
            });
        }

        (function() {
          const TIMEOUT_MS = ${jsTimeout};
          const CURRENT_SOURCE_NAME = "${sourceInfo.name}";
          // Store original fetch and XMLHttpRequest to monitor network requests
          const originalFetch = window.fetch;
          const originalXHR = window.XMLHttpRequest;
          let m3u8UrlsFound = []; // Array of { url: string, referer: string | null }
          let mainM3u8Found = false;
          let streamFoundAndPosted = false; // Flag to stop further processing for THIS attempt
          let domScanInterval = null; // To store the interval ID

          // Helper to post messages, ensuring source name is included
          function postToReactNative(type, message, payload) {
            const fullPayload = { type, message, source: CURRENT_SOURCE_NAME, ...payload };
            if (type === 'debug') {
                 window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', message: '[WebViewJS - ' + CURRENT_SOURCE_NAME + '] ' + message, payload: payload ? payload.payload : undefined }));
            } else {
                 window.ReactNativeWebView.postMessage(JSON.stringify(fullPayload));
            }
          }

          waitForElement('#player > iframe').then(iframe => {
            if (streamFoundAndPosted) return;
            window.location.href = iframe.src;
          }).catch(e => postToReactNative('debug', 'Error waiting for #player > iframe', { payload: e.toString() }));

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
              }, 2500);
            }

            setTimeout(() => {
                if (streamFoundAndPosted) return;
                const currentSrc = videoElement.src;
                postToReactNative('debug', 'video element src: ' + currentSrc, { payload: currentSrc });
                if (currentSrc && (currentSrc.includes('.m3u8') || currentSrc.includes('.mp4'))) {
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
            }, 3000);
          }).catch(e => postToReactNative('debug', 'Error waiting for video element', { payload: e.toString() }));

          waitForElement("#fixed-container > div.flex.flex-col.items-center.gap-y-3.title-year > button").then(elem => {
            if (streamFoundAndPosted) return;
            setTimeout(() => { if (!streamFoundAndPosted) elem.click(); }, 1000);
          }).catch(e => postToReactNative('debug', 'Error waiting for play button', { payload: e.toString() }));

          window.fetch = async function(...args) {
            if (streamFoundAndPosted) return originalFetch.apply(this, args);
            const urlStr = args[0].toString();
            let actualReferer = null;
            try {
                const request = new Request(args[0], args[1]);
                if (request.referrer && request.referrer !== 'about:client' && request.referrer !== '') { actualReferer = request.referrer; }
                else if (request.referrer === 'about:client') { actualReferer = window.location.href; }
            } catch (e) {
                if (args[1] && args[1].headers) {
                    const headers = new Headers(args[1].headers);
                    if (headers.has('Referer')) { actualReferer = headers.get('Referer'); }
                }
            }
            postToReactNative('debug', 'Fetch Intercept: URL=' + urlStr, { payload: { referer: actualReferer }});

            if (urlStr.includes('.m3u8')) {
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
              if (urlStr.includes('.m3u8')) { _urlForM3U8 = urlStr; } else { _urlForM3U8 = null; }
              return _originalOpen.apply(this, arguments);
            };
            xhr.setRequestHeader = function(header, value) {
                if (header.toLowerCase() === 'referer') { _capturedRefererHeader = value; }
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
                    scriptEl.textContent = \`
                      (function() {
                        const IFRAME_SOURCE_NAME = "${sourceInfo.name}";
                        function postToParent(type, message, payload) {
                            window.parent.postMessage({ type, message, source: IFRAME_SOURCE_NAME, ...payload }, '*');
                        }
                        const oFetch = window.fetch;
                        window.fetch = async function(...args) {
                          const url = args[0].toString();
                          if (url.includes('.m3u8')) { postToParent('stream', 'Stream from iframe fetch', { url }); }
                          return oFetch.apply(this, args);
                        };
                        const oXHR = window.XMLHttpRequest;
                        window.XMLHttpRequest = function() {
                          const xhr = new oXHR();
                          const oOpen = xhr.open;
                          xhr.open = function(m, u) {
                            if (u.toString().includes('.m3u8')) { postToParent('stream', 'Stream from iframe XHR', { url: u.toString() }); }
                            return oOpen.apply(this, arguments);
                          };
                          return xhr;
                        };
                      })();
                    \`;
                    iframeWindow.document.head.appendChild(scriptEl);
                  }
                } catch (e) { /* Cross-origin issues */ }
              });
            } catch (e) {}
          }
          
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

          domScanInterval = setInterval(function() {
            if (streamFoundAndPosted) { clearInterval(domScanInterval); return; }
            document.querySelectorAll('source, video').forEach(el => {
              if (streamFoundAndPosted) return;
              if (el.src && (el.src.includes('.m3u8') || el.src.includes(".mp4")) && !m3u8UrlsFound.some(item => item.url === el.src)) {
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
      `;

        let attemptConcluded = false; // To prevent multiple callbacks for this specific attempt

        const headers = Platform.OS === 'ios' ? {
            'Referer': `${sourceOrigin}/`,
            'Origin': sourceOrigin,
        } : {
            'Referer': `${sourceOrigin}/`,
            'Origin': sourceOrigin,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        
        const webViewConfig = {
            source: {
                uri: embedUrl,
                //headers: headers
            },
            injectedJavaScript: modifiedInjectedJavaScript,
            onMessage: (event) => {
                if (attemptConcluded) return;
                try {
                    const data = JSON.parse(event.nativeEvent.data);

                    // Ensure message is from the current source attempt
                    if (data.source !== sourceInfo.name) {
                        return;
                    }

                    if (data.type === 'debug') {
                        console.log(data.message);
                    } else if (data.type === 'stream' && data.url) {
                        attemptConcluded = true;
                        if (onStreamFound) {
                            onStreamFound(data.url, data.referer !== undefined ? data.referer : null, sourceInfo.name);
                        }
                        // Do not proceed to next source, success.
                    } else if (data.type === 'stream_candidate') {
                    } else if (data.type === 'error') { // Error from injected JS (e.g., timeout)
                        attemptConcluded = true;
                        console.error(`[StreamExtractor] Error from WebView JS on ${sourceInfo.name}:`, data.message);
                        if (onSourceError) {
                            onSourceError(new Error(data.message), sourceInfo.name);
                        }
                        tryNextSource(); // Try next source
                    }
                } catch (e) {
                    if (attemptConcluded) return;
                    attemptConcluded = true;
                    console.error(`[StreamExtractor] Error parsing WebView message from ${sourceInfo.name}:`, e);
                    if (onSourceError) {
                        onSourceError(e, sourceInfo.name);
                    }
                    tryNextSource(); // Try next source
                }
            },
            onError: (syntheticEvent) => { // WebView loading error (e.g. page not found)
                if (attemptConcluded) return;
                attemptConcluded = true;
                const { nativeEvent } = syntheticEvent;
                console.error(`[StreamExtractor] WebView onError (loading error) for ${sourceInfo.name} - ${embedUrl}:`, nativeEvent.description);
                if (onSourceError) {
                    //onSourceError(new Error(`WebView loading error for ${sourceInfo.name}: ${nativeEvent.description}`), sourceInfo.name);
                }
                tryNextSource(); // Try next source
            },
            onHttpError: (syntheticEvent) => { // HTTP errors like 403, 404
                if (attemptConcluded) return;
                attemptConcluded = true;
                const { nativeEvent } = syntheticEvent;
                console.error(`[StreamExtractor] WebView HTTP error for ${sourceInfo.name} - ${embedUrl}: ${nativeEvent.statusCode}`);
                if (nativeEvent.statusCode === 403 && onManualInterventionRequired) {
                    onManualInterventionRequired(embedUrl, sourceInfo.name);
                } else {
                    if (onSourceError) {
                        //onSourceError(new Error(`WebView HTTP error for ${sourceInfo.name}: ${nativeEvent.statusCode}`), sourceInfo.name);
                    }
                }
                tryNextSource(); // Try next source
            }
        };
        
        if (provideWebViewConfigForAttempt) {
            provideWebViewConfigForAttempt(webViewConfig, sourceInfo.name, `${sourceInfo.name}-${attemptKey}`);
        }
    };

    tryNextSource(); // Start the process with the first source
};

export const extractStreamFromSpecificSource = (
    sourceInfo, // The specific source object { name, baseUrl, timeoutInSeconds }
    tmdbId,
    type,
    season,
    episode,
    onStreamFound, // Callback: (url, referer, sourceName) => void
    onSourceError, // Callback: (error, sourceName) => void
    onManualInterventionRequired, // Callback: (manualUrl, sourceName) => void
    provideWebViewConfigForAttempt // Callback: (webViewConfig, sourceName, attemptKey) => void
) => {
    let attemptKey = `specific-${sourceInfo.name}-${Date.now()}`;

    const embedUrl = getApiStreamingUrl(sourceInfo.baseUrl, tmdbId, type, season, episode);

    if (!embedUrl) {
        console.error(`[StreamExtractor] (Specific) Could not generate embed URL for source: ${sourceInfo.name}`);
        if (onSourceError) {
            onSourceError(new Error(`Failed to generate embed URL for ${sourceInfo.name}`), sourceInfo.name);
        }
        return;
    }

    const sourceOrigin = new URL(embedUrl).origin;
    const jsTimeout = (sourceInfo.timeoutInSeconds || 20) * 1000;

    // Re-use the same injectedJavaScript logic, slightly adapted if needed, or directly use the one from extractM3U8Stream
    // For simplicity, we'll assume the existing modifiedInjectedJavaScript structure is suitable.
    // The key is that it uses CURRENT_SOURCE_NAME which will be set to sourceInfo.name.
    const modifiedInjectedJavaScript = `
    function waitForElement(selector) {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (streamFoundAndPosted) { clearInterval(interval); return; }
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, 100);
        });
    }

    (function() {
      const TIMEOUT_MS = ${jsTimeout};
      const CURRENT_SOURCE_NAME = "${sourceInfo.name}";
      const originalFetch = window.fetch;
      const originalXHR = window.XMLHttpRequest;
      let m3u8UrlsFound = [];
      let mainM3u8Found = false;
      let streamFoundAndPosted = false;
      let domScanInterval = null;

      function postToReactNative(type, message, payload) {
        const fullPayload = { type, message, source: CURRENT_SOURCE_NAME, ...payload };
        if (type === 'debug') {
             window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', message: '[WebViewJS - ' + CURRENT_SOURCE_NAME + '] ' + message, payload: payload ? payload.payload : undefined }));
        } else {
             window.ReactNativeWebView.postMessage(JSON.stringify(fullPayload));
        }
      }

      waitForElement('#player > iframe').then(iframe => {
        if (streamFoundAndPosted) return;
        window.location.href = iframe.src;
      }).catch(e => postToReactNative('debug', 'Error waiting for #player > iframe', { payload: e.toString() }));

      let videoElementInteracted = false;

      waitForElement('video').then(videoElement => {
        if (streamFoundAndPosted) return;
        videoElement.play().catch(e => postToReactNative('debug', 'Video play() failed', { payload: e.toString() }));

        if (!videoElementInteracted) {
          setTimeout(() => {
            if (streamFoundAndPosted) return;
            try { videoElement.click(); } catch (ignored) {}
            videoElementInteracted = true;
          }, 1500);
        }

        setTimeout(() => {
            if (streamFoundAndPosted) return;
            const currentSrc = videoElement.src;
            if (currentSrc && (currentSrc.includes('.m3u8') || currentSrc.includes('.mp4'))) {
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
        }, 3000);
      }).catch(e => postToReactNative('debug', 'Error waiting for video element', { payload: e.toString() }));

      waitForElement("#fixed-container > div.flex.flex-col.items-center.gap-y-3.title-year > button").then(elem => {
        if (streamFoundAndPosted) return;
        setTimeout(() => { if (!streamFoundAndPosted) elem.click(); }, 1000);
      }).catch(e => postToReactNative('debug', 'Error waiting for play button', { payload: e.toString() }));

      window.fetch = async function(...args) {
        if (streamFoundAndPosted) return originalFetch.apply(this, args);
        const urlStr = args[0].toString();
        let actualReferer = null;
        try {
            const request = new Request(args[0], args[1]);
            if (request.referrer && request.referrer !== 'about:client' && request.referrer !== '') { actualReferer = request.referrer; }
            else if (request.referrer === 'about:client') { actualReferer = window.location.href; }
        } catch (e) {
            if (args[1] && args[1].headers) {
                const headers = new Headers(args[1].headers);
                if (headers.has('Referer')) { actualReferer = headers.get('Referer'); }
            }
        }
        postToReactNative('debug', 'Fetch Intercept: URL=' + urlStr, { payload: { referer: actualReferer }});

        if (urlStr.includes('.m3u8')) {
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
          if (urlStr.includes('.m3u8')) { _urlForM3U8 = urlStr; } else { _urlForM3U8 = null; }
          return _originalOpen.apply(this, arguments);
        };
        xhr.setRequestHeader = function(header, value) {
            if (header.toLowerCase() === 'referer') { _capturedRefererHeader = value; }
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
      
      function checkIframes() {
        if (streamFoundAndPosted) return;
        try {
          document.querySelectorAll('iframe').forEach(frame => {
            if (streamFoundAndPosted) return;
            try {
              const iframeWindow = frame.contentWindow;
              if (iframeWindow && iframeWindow.document && !iframeWindow.SKIP_FLUX_INJECTION) {
                iframeWindow.SKIP_FLUX_INJECTION = true;
                const scriptEl = iframeWindow.document.createElement('script');
                scriptEl.textContent = \`
                  (function() {
                    const IFRAME_SOURCE_NAME = "${sourceInfo.name}";
                    function postToParent(type, message, payload) {
                        window.parent.postMessage({ type, message, source: IFRAME_SOURCE_NAME, ...payload }, '*');
                    }
                    const oFetch = window.fetch;
                    window.fetch = async function(...args) {
                      const url = args[0].toString();
                      if (url.includes('.m3u8')) { postToParent('stream', 'Stream from iframe fetch', { url }); }
                      return oFetch.apply(this, args);
                    };
                    const oXHR = window.XMLHttpRequest;
                    window.XMLHttpRequest = function() {
                      const xhr = new oXHR();
                      const oOpen = xhr.open;
                      xhr.open = function(m, u) {
                        if (u.toString().includes('.m3u8')) { postToParent('stream', 'Stream from iframe XHR', { url: u.toString() }); }
                        return oOpen.apply(this, arguments);
                      };
                      return xhr;
                    };
                  })();
                \`;
                iframeWindow.document.head.appendChild(scriptEl);
              }
            } catch (e) { /* Cross-origin issues */ }
          });
        } catch (e) {}
      }
      
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

      domScanInterval = setInterval(function() {
        if (streamFoundAndPosted) { clearInterval(domScanInterval); return; }
        document.querySelectorAll('source, video').forEach(el => {
          if (streamFoundAndPosted) return;
          if (el.src && el.src.includes('.m3u8') && !m3u8UrlsFound.some(item => item.url === el.src)) {
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
      
      setTimeout(function() {
        if (streamFoundAndPosted) return;
        if (domScanInterval) clearInterval(domScanInterval);
        if (m3u8UrlsFound.length === 0 && !mainM3u8Found) {
          postToReactNative('error', 'No m3u8 stream found after timeout');
        } else if (!mainM3u8Found && m3u8UrlsFound.length > 0) {
          let bestItem = m3u8UrlsFound.sort((a, b) => b.url.length - a.url.length)[0];
          postToReactNative('stream', 'Posting best fallback stream on timeout', { url: bestItem.url, referer: bestItem.referer });
          mainM3u8Found = true;
        }
        streamFoundAndPosted = true;
      }, TIMEOUT_MS);
      
      true;
    })();
  `;

    let attemptConcluded = false;

    const headers = Platform.OS === 'ios' ? {
        'Referer': `${sourceOrigin}/`,
        'Origin': sourceOrigin,
    } : {
        'Referer': `${sourceOrigin}/`,
        'Origin': sourceOrigin,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const webViewConfig = {
        source: {
            uri: embedUrl,
            // headers: headers // Headers are often problematic with WebView source prop directly
        },
        injectedJavaScript: modifiedInjectedJavaScript,
        onMessage: (event) => {
            if (attemptConcluded) return;
            try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.source !== sourceInfo.name) return;

                if (data.type === 'debug') {
                } else if (data.type === 'stream' && data.url) {
                    attemptConcluded = true;
                    if (onStreamFound) {
                        onStreamFound(data.url, data.referer !== undefined ? data.referer : null, sourceInfo.name);
                    }
                } else if (data.type === 'stream_candidate') {
                } else if (data.type === 'error') {
                    attemptConcluded = true;
                    console.error(`[StreamExtractor] (Specific) Error from WebView JS on ${sourceInfo.name}:`, data.message);
                    if (onSourceError) {
                        onSourceError(new Error(data.message), sourceInfo.name);
                    }
                }
            } catch (e) {
                if (attemptConcluded) return;
                attemptConcluded = true;
                console.error(`[StreamExtractor] (Specific) Error parsing WebView message from ${sourceInfo.name}:`, e);
                if (onSourceError) {
                    onSourceError(e, sourceInfo.name);
                }
            }
        },
        onError: (syntheticEvent) => {
            if (attemptConcluded) return;
            attemptConcluded = true;
            const { nativeEvent } = syntheticEvent;
            console.error(`[StreamExtractor] (Specific) WebView onError for ${sourceInfo.name} - ${embedUrl}:`, nativeEvent.description);
            if (onSourceError) {
                onSourceError(new Error(`WebView loading error for ${sourceInfo.name}: ${nativeEvent.description}`), sourceInfo.name);
            }
        },
        onHttpError: (syntheticEvent) => {
            if (attemptConcluded) return;
            attemptConcluded = true;
            const { nativeEvent } = syntheticEvent;
            console.error(`[StreamExtractor] (Specific) WebView HTTP error for ${sourceInfo.name} - ${embedUrl}: ${nativeEvent.statusCode}`);
            if (nativeEvent.statusCode === 403 && onManualInterventionRequired) {
                onManualInterventionRequired(embedUrl, sourceInfo.name);
            } else {
                if (onSourceError) {
                    onSourceError(new Error(`WebView HTTP error for ${sourceInfo.name}: ${nativeEvent.statusCode}`), sourceInfo.name);
                }
            }
        }
    };

    if (provideWebViewConfigForAttempt) {
        provideWebViewConfigForAttempt(webViewConfig, sourceInfo.name, attemptKey);
    }
};


export default {
    extractM3U8Stream,
    extractStreamFromSpecificSource
};