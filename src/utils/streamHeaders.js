export const buildStreamHeaders = (url, referer) => {
  if (url && url.startsWith('file://')) {
    return {};
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*'
  };

  let originToUse = 'https://vidsrc.su';
  let refererToUse = 'https://vidsrc.su/';

  if (referer) {
    try {
      const urlObj = new URL(referer);
      refererToUse = `${urlObj.protocol}//${urlObj.hostname}/`;
      originToUse = urlObj.origin;
    } catch (e) {
      refererToUse = referer;
      try {
        originToUse = new URL(referer).origin;
      } catch (e2) { }
    }
  } else if (url) {
    try {
      const videoUrlObj = new URL(url);
      originToUse = videoUrlObj.origin;
      refererToUse = videoUrlObj.origin + '/';
    } catch (e) { }
  }

  headers['Origin'] = originToUse;
  if (refererToUse && url && !url.includes("fleurixsun.xyz")) {
    headers['Referer'] = refererToUse;
  }

  return headers;
};
