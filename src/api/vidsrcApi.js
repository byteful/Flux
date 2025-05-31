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
export const getStreamingUrl = (baseUrl, tmdbId, type = 'movie', season = null, episode = null) => {
  let path;
  // The baseUrl provided here is the `baseUrl` (derived from defaultBaseUrl) from the source object.
  // The path construction logic seems generic enough for the current sources.
  // If a source required a radically different path structure not based on /tv/... or /movie/...
  // then this function would need to be more conditional, or the path construction
  // could be part of the source object itself.

  if (type === 'tv' && season && episode) {
    path = `/tv/${tmdbId}/${season}/${episode}`;
  } else if (type === 'movie') {
    path = `/movie/${tmdbId}`;
  } else {
    console.warn(`[vidsrcApi] Invalid type or missing season/episode for TV: ${type}`);
    return null;
  }
  // The problem description mentioned autoPlay=true for vidsrc.cc, let's assume it's desired for all.
  // The original code for embed.su and vidsrc.su did NOT have autoPlay=true.
  // Reverting to no autoPlay query param for now, as per original file structure for these two.
  // If autoPlay is desired, it should be added back here: `${baseUrl}${path}?autoPlay=true`
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