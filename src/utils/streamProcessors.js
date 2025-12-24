class StreamProcessor {
  constructor(sourceName, timeoutInSeconds) {
    this.sourceName = sourceName;
    this.timeoutInSeconds = timeoutInSeconds;
    this.context = {};
  }

  setContext(context) {
    this.context = context || {};
  }

  getInjectedJavaScript() {
    const jsTimeout = this.timeoutInSeconds * 1000;
    const customJS = this.getCustomJavaScript();
    
    return `
    (function() {
      const TIMEOUT_MS = ${jsTimeout};
      const CURRENT_SOURCE_NAME = "${this.sourceName}";
      
      const originalFetch = window.fetch;
      const originalXHR = window.XMLHttpRequest;
      let m3u8UrlsFound = [];
      let mainM3u8Found = false;
      let streamFoundAndPosted = false;
      let domScanInterval = null;

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

      ${customJS}

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
            } catch (e) {}
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
    true;
`;
  }

  getCustomJavaScript() {
    return '';
  }
}

class VidSrcCCStreamProcessor extends StreamProcessor {
  constructor(timeoutInSeconds) {
    super('vidsrc.cc', timeoutInSeconds);
  }
}

class VidSrcMEStreamProcessor extends StreamProcessor {
  constructor(timeoutInSeconds) {
    super('vidsrc.me', timeoutInSeconds);
  }

  getCustomJavaScript() {
    return `
        waitForElement(".fas").then(elem => {
          elem.click();
        });
      `;
  }
}

class CinebyStreamProcessor extends StreamProcessor {
  constructor(timeoutInSeconds) {
    super('cineby.gd', timeoutInSeconds);
  }

  getCustomJavaScript() {
    return `
        waitForElement("button").then(elem => {
          elem.click();
        });
      `;
  }
}

export const getStreamProcessor = (sourceName, timeoutInSeconds) => {
  switch(sourceName) {
    case 'vidsrc.cc':
      return new VidSrcCCStreamProcessor(timeoutInSeconds);
    case 'vidsrc.me':
      return new VidSrcMEStreamProcessor(timeoutInSeconds);
    case 'cineby.gd':
      return new CinebyStreamProcessor(timeoutInSeconds);
    default:
      return new StreamProcessor(sourceName, timeoutInSeconds);
  }
};

export default {
  StreamProcessor,
  VidSrcCCStreamProcessor,
  VidSrcMEStreamProcessor,
  CinebyStreamProcessor,
  getStreamProcessor
};

