import { WebView } from 'react-native-webview';
import { getStreamingUrl } from '../api/vidsrcApi';
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
export const extractM3U8Stream = (tmdbId, type, season, episode, onStreamFound, onError, onManualInterventionRequired) => {
    // Generate the embed URL using vidsrcApi
    const embedUrl = getStreamingUrl(tmdbId, type, season, episode);

    // JavaScript to inject into the WebView to intercept and extract m3u8 links
    const injectedJavaScript = `
    function waitForElement(selector) {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, 100);
        });
    }

    (function() {
      // Store original fetch and XMLHttpRequest to monitor network requests
      const originalFetch = window.fetch;
      const originalXHR = window.XMLHttpRequest;
      let m3u8UrlsFound = []; // Array of { url: string, referer: string | null }
      let mainM3u8Found = false;
      let streamFoundAndPosted = false; // Flag to stop further processing
      let domScanInterval = null; // To store the interval ID

      waitForElement('#player > iframe').then(iframe => {
        window.location.href = iframe.src;
      });

      let videoElementInteracted = false; // To control click simulation

      waitForElement('video').then(videoElement => {
        // Attempt to play programmatically
        videoElement.play();

        // Try to simulate a click on the video element itself after a delay
        // This can help trigger players that require a click on their overlay
        if (!videoElementInteracted) {
          setTimeout(() => {
            try {
              videoElement.click();
            } catch (ignored) {}
            // Set flag after attempt, regardless of success, to avoid repeated clicks if logic were to re-enter
            videoElementInteracted = true;
          }, 1500); // Delay to allow player to potentially initialize
        }

        // Check videoElement.src after a further delay, as it might be set after play() or click()
        // This also corrects the original logic which prematurely set mainM3u8Found
        setTimeout(() => {
            const currentSrc = videoElement.src;
            if (currentSrc && (currentSrc.includes('.m3u8') || currentSrc.includes('.mp4'))) { // Check for m3u8 or mp4
              // Only consider this a "main" stream if one hasn't been definitively found by fetch/XHR yet
              // and if it's not already in our list.
              if (!m3u8UrlsFound.some(item => item.url === currentSrc)) {
                  m3u8UrlsFound.push({ url: currentSrc, referer: null }); // DOM source, no specific referer
                  // If no main M3U8 (master/playlist) has been found yet via network requests,
                  // this src (if m3u8) could be it.
                  if (!mainM3u8Found) {
                      mainM3u8Found = true; // Tentatively mark as main
                      const videoSrcPayload = { type: 'stream', url: currentSrc, referer: null };
                      window.ReactNativeWebView.postMessage(JSON.stringify(videoSrcPayload));
                      streamFoundAndPosted = true;
                      if (domScanInterval) clearInterval(domScanInterval);
                  } else {
                      // Otherwise, it's a candidate
                       const videoSrcCandidatePayload = { type: 'stream_candidate', url: currentSrc, referer: null };
                       window.ReactNativeWebView.postMessage(JSON.stringify(videoSrcCandidatePayload));
                  }
              }
            }
        }, 3000);

      });

      waitForElement("#fixed-container > div.flex.flex-col.items-center.gap-y-3.title-year > button").then(elem => {
        setTimeout(() => elem.click(), 1000);
      });

      // Override fetch to monitor for m3u8 requests
      window.fetch = async function(...args) {
        const urlStr = args[0].toString();
        let actualReferer = null;
        try {
            const request = new Request(args[0], args[1]);
            if (request.referrer && request.referrer !== 'about:client' && request.referrer !== '') {
                actualReferer = request.referrer; // It's a URL
            } else if (request.referrer === 'about:client') {
                actualReferer = window.location.href; // Referrer is the client's URL (of the iframe/document making the call)
            }
            // If request.referrer is '', actualReferer remains null (no referrer policy)
        } catch (e) {
            // Fallback for safety, though Request constructor should be robust
            if (args[1] && args[1].headers) {
                const headers = new Headers(args[1].headers); // Normalize
                if (headers.has('Referer')) {
                    actualReferer = headers.get('Referer');
                }
            }
        }
        // window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', message: '[WebViewJS] Fetch Intercept: URL=' + urlStr + ', Determined Referer=' + actualReferer }));

        if (urlStr.includes('.m3u8')) {
          const fetchCandidatePayload = { type: 'stream_candidate', url: urlStr, referer: actualReferer };
          window.ReactNativeWebView.postMessage(JSON.stringify(fetchCandidatePayload));
          
          if (!mainM3u8Found && (urlStr.includes('master') || urlStr.includes('playlist'))) {
            mainM3u8Found = true;
            const fetchStreamPayload = { type: 'stream', url: urlStr, referer: actualReferer };
            window.ReactNativeWebView.postMessage(JSON.stringify(fetchStreamPayload));
            streamFoundAndPosted = true;
            if (domScanInterval) clearInterval(domScanInterval);
          } else if (!m3u8UrlsFound.some(item => item.url === urlStr)) {
            m3u8UrlsFound.push({ url: urlStr, referer: actualReferer });
          }
        }
        return originalFetch.apply(this, args);
      };

      // Override XMLHttpRequest to monitor for m3u8 requests
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const _originalOpen = xhr.open;
        const _originalSetRequestHeader = xhr.setRequestHeader;
        const _originalSend = xhr.send;
        
        let _urlForM3U8 = null;
        let _capturedRefererHeader = null;

        xhr.open = function(method, url) {
          const urlStr = url.toString();
          _capturedRefererHeader = null; // Reset for each request
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
            if (_urlForM3U8) {
                let refererForXhr = _capturedRefererHeader;
                if (!refererForXhr && window.location && window.location.href && window.location.href !== 'about:blank') {
                    refererForXhr = window.location.href;
                }
                // window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', message: '[WebViewJS] XHR Intercept: URL=' + _urlForM3U8 + ', CapturedReferer=' + _capturedRefererHeader + ', EffectiveReferer=' + refererForXhr }));

                const xhrCandidatePayload = { type: 'stream_candidate', url: _urlForM3U8, referer: refererForXhr };
                window.ReactNativeWebView.postMessage(JSON.stringify(xhrCandidatePayload));

                if (!mainM3u8Found && (_urlForM3U8.includes('master') || _urlForM3U8.includes('playlist'))) {
                    mainM3u8Found = true;
                    const xhrStreamPayload = { type: 'stream', url: _urlForM3U8, referer: refererForXhr };
                    window.ReactNativeWebView.postMessage(JSON.stringify(xhrStreamPayload));
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
      
      // Check for iframe contents loading
      function checkIframes() {
        try {
          const iframes = document.querySelectorAll('iframe');
          iframes.forEach(frame => {
            try {
              // Try to inject script into iframe
              const iframeWindow = frame.contentWindow;
              if (iframeWindow && iframeWindow.document) {
                // Inject monitoring code into iframe
                const script = iframeWindow.document.createElement('script');
                script.textContent = \`
                  (function() {
                    const originalFetch = window.fetch;
                    const originalXHR = window.XMLHttpRequest;

                    window.fetch = async function(...args) {
                      const url = args[0];
                      const urlStr = url.toString();
                      if (urlStr.includes('.m3u8')) {
                        // Basic iframe injection currently doesn't capture referer from within iframe's network requests
                        const iframeFetchPayload = { type: 'stream', url: urlStr, referer: null };
                        // Cannot use ReactNativeWebView.postMessage directly from iframe's injected script for debug.
                        // Parent will log if it forwards.
                        window.parent.postMessage(iframeFetchPayload, '*');
                      }
                      return originalFetch.apply(this, args);
                    };

                    window.XMLHttpRequest = function() {
                      const xhr = new originalXHR();
                      const originalOpen = xhr.open;
                      xhr.open = function(method, url) {
                        const urlStr = url.toString();
                        if (urlStr.includes('.m3u8')) {
                          // Basic iframe injection currently doesn't capture referer from within iframe's network requests
                          const iframeXhrPayload = { type: 'stream', url: urlStr, referer: null };
                           // Cannot use ReactNativeWebView.postMessage directly from iframe's injected script for debug.
                          window.parent.postMessage(iframeXhrPayload, '*');
                        }
                        return originalOpen.apply(this, arguments);
                      };
                      return xhr;
                    };
                  })();
                \`;
                iframeWindow.document.head.appendChild(script);
              }
            } catch (e) {
              // Cross-origin issues prevent access
            }
          });
        } catch (e) {}
      }
      
      // Handle messages from iframes
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'stream' && event.data.url) {
          // window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', message: '[WebViewJS] Message from iframe', payload: event.data }));
          // Forward message from iframe. If iframe sends a referer, it will be in event.data.referer.
          // Otherwise, event.data.referer will be undefined.
          const iframeForwardPayload = {
            type: 'stream',
            url: event.data.url,
            referer: event.data.referer !== undefined ? event.data.referer : null
          };
          window.ReactNativeWebView.postMessage(JSON.stringify(iframeForwardPayload));
          // If an iframe directly provides a stream, consider it found.
          if (!mainM3u8Found) { // Check if a main one isn't already found to avoid conflicts
            mainM3u8Found = true; // Or handle based on iframe's stream quality if possible
            streamFoundAndPosted = true;
            if (domScanInterval) clearInterval(domScanInterval);
          }
        }
      });

      // Attempt to search for m3u8 in the DOM periodically
      domScanInterval = setInterval(function() {
        if (streamFoundAndPosted) {
          clearInterval(domScanInterval);
          return;
        }

        // Check for videos and sources in main document
        const sources = document.querySelectorAll('source');
        const videos = document.querySelectorAll('video');
        
        // Check all video elements
        videos.forEach(video => {
          if (streamFoundAndPosted) return;
          if (video.src && video.src.includes('.m3u8') && !m3u8UrlsFound.some(item => item.url === video.src)) {
            m3u8UrlsFound.push({ url: video.src, referer: null }); // DOM source, no specific referer
            // Don't post 'stream' directly from here if mainM3u8Found is false, let fallback logic handle it
            // unless this is the *only* way it's found.
            // For now, just add to candidates. The fallback logic below will pick it up.
            //  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', message: '[WebViewJS] Adding DOM video to candidates', payload: {url: video.src} }));
          }
        });
        
        // Check all sources
        sources.forEach(source => {
          if (streamFoundAndPosted) return;
          if (source.src && source.src.includes('.m3u8') && !m3u8UrlsFound.some(item => item.url === source.src)) {
            m3u8UrlsFound.push({ url: source.src, referer: null }); // DOM source, no specific referer
            // window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'debug', message: '[WebViewJS] Adding DOM source to candidates', payload: {url: source.src} }));
          }
        });
        
        // Check iframes
        if (!streamFoundAndPosted) checkIframes(); // checkIframes might set streamFoundAndPosted
        
        // Send all found URLs if no master playlist was identified yet by network interception
        if (!streamFoundAndPosted && m3u8UrlsFound.length > 0 && !mainM3u8Found) {
          // Try to find the best quality stream (typically the longest URL)
          let bestItem = m3u8UrlsFound.sort((a, b) => b.url.length - a.url.length)[0];
          const bestUrlPayload = { type: 'stream', url: bestItem.url, referer: bestItem.referer };
          window.ReactNativeWebView.postMessage(JSON.stringify(bestUrlPayload));
          mainM3u8Found = true;
          streamFoundAndPosted = true;
          clearInterval(domScanInterval);
        }
      }, 1000); // Reduced interval for faster fallback if needed, was 1000
      
      // Report if no stream found after 20 seconds
      setTimeout(function() {
        if (streamFoundAndPosted) return;

        if (m3u8UrlsFound.length === 0) {
          const timeoutErrorPayload = { type: 'error', message: 'No m3u8 stream found after timeout' };
          window.ReactNativeWebView.postMessage(JSON.stringify(timeoutErrorPayload));
        } else if (!mainM3u8Found) { // If we have candidates but no "main" one was decisively chosen
          let bestItem = m3u8UrlsFound.sort((a, b) => b.url.length - a.url.length)[0];
          const timeoutFallbackPayload = { type: 'stream', url: bestItem.url, referer: bestItem.referer };
          window.ReactNativeWebView.postMessage(JSON.stringify(timeoutFallbackPayload));
          mainM3u8Found = true; // Mark as found to prevent other logic from firing
          streamFoundAndPosted = true;
        }
        if (domScanInterval) clearInterval(domScanInterval); // Clear interval on timeout too
      }, 20000); // Keep overall timeout
      
      true;
    })();
  `;

    // Prepare the WebView configuration
    let done = false;
    const headers = Platform.OS === 'ios' ? {
        // iOS needs specific headers due to App Transport Security
        // Let WebView use its default User-Agent for iPad
        'Referer': 'https://vidsrc.su/',
        'Origin': 'https://vidsrc.su'
    } : {
        'Referer': 'https://vidsrc.su/',
        'Origin': 'https://vidsrc.su',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const webViewConfig = {
        source: {
            uri: embedUrl,
            headers: headers
        },
        injectedJavaScript: injectedJavaScript,
        onMessage: (event) => {
            if (done) return;
            try {
                const data = JSON.parse(event.nativeEvent.data);

                // Removed debug logs
                if (data.type === 'stream' && data.url) {
                    // console.log('[StreamExtractor] Stream found by WebView JS:', data); // Kept for minimal success logging, can be removed
                    onStreamFound(data.url, data.referer !== undefined ? data.referer : null);
                    done = true;
                } else if (data.type === 'stream_candidate') {
                    // console.log('[StreamExtractor] Stream candidate from WebView JS:', data); // Kept for minimal logging, can be removed
                } else if (data.type === 'error') {
                    // console.error('[StreamExtractor] Error from WebView JS:', data.message); // Kept for minimal error logging
                    onError(new Error(data.message));
                }
            } catch (error) {
                // console.error('[StreamExtractor] Error parsing WebView message:', error);
                onError(error);
            }
        },
        onError: (syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            // console.error('[StreamExtractor] WebView onError (loading error):', nativeEvent);
            // Don't immediately call onError for HTTP errors, let onHttpError handle it for potential manual intervention
            if (!nativeEvent.url || !nativeEvent.description?.includes("net::ERR_HTTP_RESPONSE_CODE_FAILURE")) {
                 onError(new Error(`WebView loading error: ${nativeEvent.description}`));
            }
        },
        onHttpError: (syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            if (nativeEvent.statusCode === 403 && onManualInterventionRequired) {
                onManualInterventionRequired(embedUrl); // Pass URL for context
            } else {
                // console.error(`[StreamExtractor] WebView HTTP error: ${nativeEvent.statusCode} on ${nativeEvent.url}`);
                onError(new Error(`WebView HTTP error: ${nativeEvent.statusCode} on ${nativeEvent.url}`));
            }
        }
    };

    return webViewConfig;
};

export default {
    extractM3U8Stream
};