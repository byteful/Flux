import { getStreamSourceOrder, DEFAULT_STREAM_SOURCES as storageDefaultSources } from '../utils/storage';

// This will hold the dynamically ordered sources.
// It's initialized with defaults from storage.js and then updated.
// Ensure the structure here matches what getStreamSourceOrder and DEFAULT_STREAM_SOURCES in storage.js provide.
let currentStreamSources = [...storageDefaultSources.map(s => ({
  name: s.name,
  baseUrl: s.defaultBaseUrl, // This is the key change: use defaultBaseUrl
  timeoutInSeconds: s.timeoutInSeconds,
  type: s.type,
}))];


// Function to initialize and refresh the stream source order
export const initializeStreamSources = async () => {
  const orderedSourcesFromStorage = await getStreamSourceOrder(); // This now returns full source objects
  currentStreamSources = orderedSourcesFromStorage.map(source => ({
    name: source.name,
    baseUrl: source.defaultBaseUrl, // Ensure this field is used
    timeoutInSeconds: source.timeoutInSeconds,
    type: source.type,
  }));
  return currentStreamSources;
};

// Getter for the current sources
export const getActiveStreamSources = () => {
  // If currentStreamSources is empty (e.g. first run before async init completes fully),
  // return a mapped version of storageDefaultSources.
  if (!currentStreamSources || currentStreamSources.length === 0) {
    console.warn("[vidsrcApi] getActiveStreamSources: currentStreamSources not yet populated, returning mapped defaults.");
    return [...storageDefaultSources.map(s => ({
        name: s.name,
        baseUrl: s.defaultBaseUrl,
        timeoutInSeconds: s.timeoutInSeconds,
        type: s.type,
    }))];
  }
  return currentStreamSources;
};


// Function to get streaming URL for a given source's baseUrl, movie or TV show
export const getStreamingUrl = (baseUrl, tmdbId, type = 'movie', season = null, episode = null, mediaTitle = null) => {
  let path;

  if (baseUrl.includes('vidsrc.cc')) {
    let url = baseUrl;
    if (type === 'tv' && season && episode) {
      url += `/tv/${tmdbId}/${season}/${episode}`;
    } else if (type === 'movie') {
      url += `/movie/${tmdbId}`;
    } else {
      console.warn(`[vidsrcApi] Invalid type or missing season/episode for TV: ${type}`);
      return null;
    }
    return `${url}?autoPlay=false`;
  }

  if (type === 'tv' && season && episode) {
    path = `/tv/${tmdbId}/${season}/${episode}`;
  } else if (type === 'movie') {
    path = `/movie/${tmdbId}`;
  } else {
    console.warn(`[vidsrcApi] Invalid type or missing season/episode for TV: ${type}`);
    return null;
  }
  return `${baseUrl}${path}`;
};

// Function to determine the media type (movie or tv)
export const getMediaType = (media) => {
  return media.title ? 'movie' : 'tv';
};

export default {
  initializeStreamSources,
  getActiveStreamSources,
  getStreamingUrl,
  getMediaType,
  // Exporting storageDefaultSources as DEFAULT_STREAM_SOURCES for the settings screen
  // to have a consistent reference to the available source definitions.
  DEFAULT_STREAM_SOURCES: storageDefaultSources
};