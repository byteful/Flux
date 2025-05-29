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
      let m3u8UrlsFound = [];
      let mainM3u8Found = false;

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
            if (currentSrc && (currentSrc.includes('.m3u8') || currentSrc.includes('.mp4'))) { // Check for m3u8 (mp4 check commented for now)
              // Only consider this a "main" stream if one hasn't been definitively found by fetch/XHR yet
              // and if it's not already in our list.
              if (!m3u8UrlsFound.includes(currentSrc)) {
                  m3u8UrlsFound.push(currentSrc);
                  // If no main M3U8 (master/playlist) has been found yet via network requests,
                  // this src (if m3u8) could be it.
                  if (!mainM3u8Found && currentSrc.includes('.m3u8')) {
                      mainM3u8Found = true; // Tentatively mark as main
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'stream',
                          url: currentSrc
                      }));
                  } else {
                      // Otherwise, it's a candidate
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'stream_candidate',
                          url: currentSrc
                      }));
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
        const url = args[0];
        const urlStr = url.toString();
        
        // Check if this is an m3u8 link
        if (urlStr.includes('.m3u8')) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stream_candidate',
            url: urlStr
          }));
          
          // If URL contains 'master' or 'playlist', it's likely the main playlist
          if (!mainM3u8Found && (urlStr.includes('master') || urlStr.includes('playlist'))) {
            mainM3u8Found = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'stream',
              url: urlStr
            }));
          } else if (!m3u8UrlsFound.includes(urlStr)) {
            m3u8UrlsFound.push(urlStr);
          }
        }
        
        return originalFetch.apply(this, args);
      };

      // Override XMLHttpRequest to monitor for m3u8 requests
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        
        xhr.open = function(method, url) {
          const urlStr = url.toString();
          if (urlStr.includes('.m3u8')) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'stream_candidate',
              url: urlStr
            }));
            
            // If URL contains 'master' or 'playlist', it's likely the main playlist
            if (!mainM3u8Found && (urlStr.includes('master') || urlStr.includes('playlist'))) {
              mainM3u8Found = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'stream',
                url: urlStr
              }));
            } else if (!m3u8UrlsFound.includes(urlStr)) {
              m3u8UrlsFound.push(urlStr);
            }
          }
          return originalOpen.apply(this, arguments);
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
                        window.parent.postMessage({ type: 'stream', url: urlStr }, '*');
                      }
                      return originalFetch.apply(this, args);
                    };

                    window.XMLHttpRequest = function() {
                      const xhr = new originalXHR();
                      const originalOpen = xhr.open;
                      xhr.open = function(method, url) {
                        const urlStr = url.toString();
                        if (urlStr.includes('.m3u8')) {
                          window.parent.postMessage({ type: 'stream', url: urlStr }, '*');
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
          window.ReactNativeWebView.postMessage(JSON.stringify(event.data));
        }
      });

      // Attempt to search for m3u8 in the DOM periodically
      setInterval(function() {
        // Check for videos and sources in main document
        const sources = document.querySelectorAll('source');
        const videos = document.querySelectorAll('video');
        
        // Check all video elements
        videos.forEach(video => {
          if (video.src && video.src.includes('.m3u8') && !m3u8UrlsFound.includes(video.src)) {
            m3u8UrlsFound.push(video.src);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'stream',
              url: video.src
            }));
          }
        });
        
        // Check all sources
        sources.forEach(source => {
          if (source.src && source.src.includes('.m3u8') && !m3u8UrlsFound.includes(source.src)) {
            m3u8UrlsFound.push(source.src);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'stream',
              url: source.src
            }));
          }
        });
        
        // Check iframes
        checkIframes();
        
        // Send all found URLs if no master playlist was identified
        if (m3u8UrlsFound.length > 0 && !mainM3u8Found) {
          // Try to find the best quality stream (typically the longest URL)
          let bestUrl = m3u8UrlsFound.sort((a, b) => b.length - a.length)[0];
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stream',
            url: bestUrl
          }));
          mainM3u8Found = true;
        }
      }, 1000);
      
      // Report if no stream found after 30 seconds
      setTimeout(function() {
        if (m3u8UrlsFound.length === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: 'No m3u8 stream found after timeout'
          }));
        } else if (!mainM3u8Found) {
          // If we found some m3u8 URLs but didn't pick a main one yet, use the first one
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stream',
            url: m3u8UrlsFound[0]
          }));
        }
      }, 20000);
      
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

                if (data.type === 'stream' && data.url) {
                    onStreamFound(data.url);
                    done = true;
                } else if (data.type === 'stream_candidate') {
                    // Stream candidate found, could be logged or used for heuristics if needed
                } else if (data.type === 'error') {
                    console.error('[StreamExtractor] Error from WebView JS:', data.message);
                    onError(new Error(data.message));
                }
            } catch (error) {
                console.error('[StreamExtractor] Error parsing WebView message:', error);
                onError(error);
            }
        },
        onError: (syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[StreamExtractor] WebView onError (loading error):', nativeEvent);
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
                onError(new Error(`WebView HTTP error: ${nativeEvent.statusCode} on ${nativeEvent.url}`));
            }
        }
    };

    return webViewConfig;
};

export default {
    extractM3U8Stream
};