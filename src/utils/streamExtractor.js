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
    console.log('[StreamExtractor] Embed URL:', embedUrl);

    // JavaScript to inject into the WebView to intercept and extract m3u8 links
    const injectedJavaScript = `
    (function() {
      // Store original fetch and XMLHttpRequest to monitor network requests
      const originalFetch = window.fetch;
      const originalXHR = window.XMLHttpRequest;
      let m3u8UrlsFound = [];
      let mainM3u8Found = false;

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
        } catch (e) {
        }
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
    console.log('[StreamExtractor] Using headers:', headers);

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
                console.log('[StreamExtractor] WebView Message:', data);

                if (data.type === 'stream' && data.url) {
                    console.log('[StreamExtractor] Stream found:', data.url);
                    onStreamFound(data.url);
                    done = true;
                } else if (data.type === 'stream_candidate') {
                    console.log('[StreamExtractor] Stream candidate:', data.url);
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
            // console.error('[StreamExtractor] WebView onHttpError:', nativeEvent); // Removed debug log
            if (nativeEvent.statusCode === 403 && onManualInterventionRequired) {
                // console.log('[StreamExtractor] HTTP 403 detected, calling onManualInterventionRequired.'); // Removed debug log
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