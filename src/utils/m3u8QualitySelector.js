const PREFERRED_MIN_HEIGHT = 1080;
const FALLBACK_MIN_HEIGHT = 720;

export const resolveUrl = (relativeUrl, baseUrl) => {
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  try {
    const base = new URL(baseUrl);
    if (relativeUrl.startsWith('/')) {
      return `${base.protocol}//${base.host}${relativeUrl}`;
    }
    const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return basePath + relativeUrl;
  } catch {
    return relativeUrl;
  }
};

export const selectBestVariantByHeight = (variants) => {
  if (!variants || variants.length === 0) return null;

  const sorted = [...variants].sort((a, b) => b.bandwidth - a.bandwidth);

  return (
    sorted.find(v => v.height === PREFERRED_MIN_HEIGHT) ||
    sorted.find(v => v.height >= PREFERRED_MIN_HEIGHT) ||
    sorted.find(v => v.height >= FALLBACK_MIN_HEIGHT) ||
    sorted[0]
  );
};

const parseVariants = (content) => {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const variants = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    const nextLine = lines[i + 1];
    if (!nextLine || nextLine.startsWith('#')) continue;

    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
    const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);

    variants.push({
      bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0,
      height: resolutionMatch ? parseInt(resolutionMatch[2], 10) : 0,
      url: nextLine,
    });

    i++;
  }

  return variants;
};

export const resolveHighestQualityStream = async (masterUrl, headers = {}) => {
  try {
    const response = await fetch(masterUrl, { headers });
    if (!response.ok) return masterUrl;

    const content = await response.text();
    if (!content.includes('#EXT-X-STREAM-INF:')) return masterUrl;

    const variants = parseVariants(content);
    if (variants.length === 0) return masterUrl;

    const best = selectBestVariantByHeight(variants);
    if (!best) return masterUrl;

    return resolveUrl(best.url, masterUrl);
  } catch {
    return masterUrl;
  }
};
