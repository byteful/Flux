// Function to get streaming URL for movie or TV show from Vidsrc API
export const getStreamingUrl = (tmdbId, type = 'movie', season = null, episode = null) => {
  if (type === 'tv' && season && episode) {
    return `https://vidsrc.su/embed/tv/${tmdbId}/${season}/${episode}`;
  }
  return `https://vidsrc.su/embed/movie/${tmdbId}`;
};

// Function to determine the media type (movie or tv)
export const getMediaType = (media) => {
  return media.title ? 'movie' : 'tv';
};

export default {
  getStreamingUrl,
  getMediaType
};