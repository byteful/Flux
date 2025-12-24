import axios from 'axios';

const TMDB_API_KEY = 'fa953c513c37da857fb3155738358ff0'; // I do not care that this is public. Its free...
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const HIGH_RES_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w1280';

// Define popular US providers (Netflix, Prime Video, Hulu, Disney+, Max)
const US_PROVIDERS_STRING = '8|9|15|337|1899';
const US_REGION = 'US';

// Helper function to get today's date in YYYY-MM-DD format
const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to create standard image URLs
export const getImageUrl = (path) => {
  if (!path) return null;
  return `${IMAGE_BASE_URL}${path}`;
};

// Helper function to create high-resolution image URLs
export const getHighResImageUrl = (path) => {
  if (!path) return null;
  return `${HIGH_RES_IMAGE_BASE_URL}${path}`;
};

// Fetch popular movies available on major US streaming services
export const fetchPopularMovies = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        sort_by: 'popularity.desc',
        watch_region: US_REGION,
        with_watch_providers: US_PROVIDERS_STRING,
        include_adult: false,
        'primary_release_date.lte': getTodayDateString(), // Ensure movie is released
      },
    });
    // Filter out results without a poster_path and ensure release date is valid
    const filteredResults = response.data.results.filter(item =>
      item.poster_path &&
      item.release_date && new Date(item.release_date) <= new Date(getTodayDateString())
    );
    return filteredResults;
  } catch (error) {
    console.error('Error fetching popular movies:', error);
    throw error;
  }
};

// Fetch popular TV shows available on major US streaming services
export const fetchPopularTVShows = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/discover/tv`, {
      params: {
        api_key: TMDB_API_KEY,
        sort_by: 'popularity.desc',
        watch_region: US_REGION,
        with_watch_providers: US_PROVIDERS_STRING,
        include_adult: false,
        'first_air_date.lte': getTodayDateString(), // Ensure TV show has aired
      },
    });
    // Filter out results without a poster_path and ensure first air date is valid
    const filteredResults = response.data.results.filter(item =>
      item.poster_path &&
      item.first_air_date && new Date(item.first_air_date) <= new Date(getTodayDateString())
    );
    return filteredResults;
  } catch (error) {
    console.error('Error fetching popular TV shows:', error);
    throw error;
  }
};

// Search for movies and TV shows
export const searchMedia = async (query) => {
  try {
    const response = await axios.get(`${BASE_URL}/search/multi`, {
      params: { 
        api_key: TMDB_API_KEY, 
        query,
        include_adult: false // Explicitly exclude adult content
      },
    });
    // Filter out unreleased content and items without poster_path
    const currentDate = new Date(getTodayDateString());
    const filteredResults = response.data.results.filter(item => {
      if (!item.poster_path) return false;
      if (item.media_type === 'movie') {
        return item.release_date && new Date(item.release_date) <= currentDate;
      }
      if (item.media_type === 'tv') {
        return item.first_air_date && new Date(item.first_air_date) <= currentDate;
      }
      return true; // Keep other media types if any, or filter as needed
    });
    return filteredResults;
  } catch (error) {
    console.error('Error searching media:', error);
    throw error;
  }
};

// Fetch movie details
export const fetchMovieDetails = async (movieId) => {
  try {
    const response = await axios.get(`${BASE_URL}/movie/${movieId}`, {
      params: { api_key: TMDB_API_KEY, append_to_response: 'credits,videos' },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching movie details:', error);
    throw error;
  }
};

// Fetch TV show details
export const fetchTVShowDetails = async (tvId) => {
  try {
    const response = await axios.get(`${BASE_URL}/tv/${tvId}`, {
      params: { api_key: TMDB_API_KEY, append_to_response: 'credits,videos' },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching TV show details:', error);
    throw error;
  }
};

// Fetch TV season details
export const fetchSeasonDetails = async (tvId, seasonNumber) => {
  try {
    const response = await axios.get(
      `${BASE_URL}/tv/${tvId}/season/${seasonNumber}`,
      {
        params: { api_key: TMDB_API_KEY },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching season details:', error);
    throw error;
  }
};

// Fetch recommended movies based on criteria (e.g., genres) AND US availability
export const fetchRecommendedMovies = async (params = {}) => {
  try {
    const response = await axios.get(`${BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        sort_by: 'popularity.desc', // Default sort
        include_adult: false, // Explicitly exclude adult content
        watch_region: US_REGION, // Add US region filter
        with_watch_providers: US_PROVIDERS_STRING, // Add US provider filter
        'primary_release_date.lte': getTodayDateString(), // Ensure movie is released
        ...params // Spread additional filter parameters (like with_genres)
      },
    });
    // Filter out results without a poster_path and ensure release date is valid
    const filteredResults = response.data.results.filter(item =>
      item.poster_path &&
      item.release_date && new Date(item.release_date) <= new Date(getTodayDateString())
    );
    return filteredResults;
  } catch (error) {
    console.error('Error fetching recommended movies:', error);
    throw error; // Re-throw or handle as needed
  }
};

// Fetch recommended TV shows based on criteria (e.g., genres) AND US availability
export const fetchRecommendedTVShows = async (params = {}) => {
  try {
    const response = await axios.get(`${BASE_URL}/discover/tv`, {
      params: {
        api_key: TMDB_API_KEY,
        sort_by: 'popularity.desc', // Default sort
        include_adult: false, // Explicitly exclude adult content
        watch_region: US_REGION, // Add US region filter
        with_watch_providers: US_PROVIDERS_STRING, // Add US provider filter
        'first_air_date.lte': getTodayDateString(), // Ensure TV show has aired
        ...params // Spread additional filter parameters (like with_genres)
      },
    });
    // Filter out results without a poster_path and ensure first air date is valid
    const filteredResults = response.data.results.filter(item =>
      item.poster_path &&
      item.first_air_date && new Date(item.first_air_date) <= new Date(getTodayDateString())
    );
    return filteredResults;
  } catch (error) {
    console.error('Error fetching recommended TV shows:', error);
    throw error; // Re-throw or handle as needed
  }
};

// Fetch media by genre AND US availability
export const fetchMediaByGenre = async (mediaType, genreId, params = {}) => {
  if (!['movie', 'tv'].includes(mediaType)) {
    throw new Error('Invalid media type specified for fetchMediaByGenre');
  }
  try {
    const response = await axios.get(`${BASE_URL}/discover/${mediaType}`, {
      params: {
        api_key: TMDB_API_KEY,
        sort_by: 'popularity.desc',
        include_adult: false,
        watch_region: US_REGION,
        with_watch_providers: US_PROVIDERS_STRING,
        with_genres: genreId,
        ...(mediaType === 'movie' && { 'primary_release_date.lte': getTodayDateString() }),
        ...(mediaType === 'tv' && { 'first_air_date.lte': getTodayDateString() }),
        ...params,
      },
    });
    // Filter out results without a poster_path and ensure release date is valid
    const currentDateFilter = new Date(getTodayDateString());
    const filteredResults = response.data.results.filter(item => {
      if (!item.poster_path) return false;
      if (mediaType === 'movie') {
        return item.release_date && new Date(item.release_date) <= currentDateFilter;
      }
      if (mediaType === 'tv') {
        return item.first_air_date && new Date(item.first_air_date) <= currentDateFilter;
      }
      return true;
    });
    return filteredResults;
  } catch (error) {
    console.error(`Error fetching ${mediaType} by genre ${genreId}:`, error);
    throw error;
  }
};

// Fetch new release movies available on major US streaming services
export const fetchNewReleaseMovies = async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const today = new Date();

    const formattedOneMonthAgo = `${oneMonthAgo.getFullYear()}-${String(oneMonthAgo.getMonth() + 1).padStart(2, '0')}-${String(oneMonthAgo.getDate()).padStart(2, '0')}`;
    const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const discoverResponse = await axios.get(`${BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        watch_region: US_REGION,
        with_watch_providers: US_PROVIDERS_STRING,
        include_adult: false,
        'primary_release_date.gte': formattedOneMonthAgo,
        'primary_release_date.lte': formattedToday,
        sort_by: 'popularity.desc', // Sort by popularity within new releases
      },
    });
    // Ensure movies are actually released and have a poster
    const todayDateCheck = new Date(getTodayDateString());
    const filteredResults = discoverResponse.data.results.filter(item =>
      item.poster_path &&
      item.release_date && new Date(item.release_date) <= todayDateCheck
    );
    return filteredResults;
  } catch (error) {
    console.error('Error fetching new release movies:', error);
    throw error;
  }
};

// Fetch new release TV shows available on major US streaming services
export const fetchNewReleaseTVShows = async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const today = new Date();

    const formattedOneMonthAgo = `${oneMonthAgo.getFullYear()}-${String(oneMonthAgo.getMonth() + 1).padStart(2, '0')}-${String(oneMonthAgo.getDate()).padStart(2, '0')}`;
    const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const discoverResponse = await axios.get(`${BASE_URL}/discover/tv`, {
      params: {
        api_key: TMDB_API_KEY,
        watch_region: US_REGION,
        with_watch_providers: US_PROVIDERS_STRING,
        include_adult: false,
        'first_air_date.gte': formattedOneMonthAgo, // Keep this for "newly added to service"
        'first_air_date.lte': formattedToday,     // and ensure it's not in the future
        sort_by: 'popularity.desc',
      },
    });
    // Ensure TV shows have actually aired and have a poster
    const todayDateFilterCheck = new Date(getTodayDateString());
    const filteredResults = discoverResponse.data.results.filter(item =>
      item.poster_path &&
      item.first_air_date && new Date(item.first_air_date) <= todayDateFilterCheck
    );
    return filteredResults;
  } catch (error) {
    console.error('Error fetching new release TV shows:', error);
    throw error;
  }
};

// Fetch recommendations for a specific movie
export const fetchMovieRecommendations = async (movieId) => {
  try {
    const response = await axios.get(`${BASE_URL}/movie/${movieId}/recommendations`, {
      params: {
        api_key: TMDB_API_KEY,
      },
    });
    const filteredResults = response.data.results.filter(item => item.poster_path);
    return filteredResults;
  } catch (error) {
    console.error(`Error fetching recommendations for movie ${movieId}:`, error);
    return [];
  }
};

// Fetch recommendations for a specific TV show
export const fetchTVShowRecommendations = async (tvId) => {
  try {
    const response = await axios.get(`${BASE_URL}/tv/${tvId}/recommendations`, {
      params: {
        api_key: TMDB_API_KEY,
      },
    });
    const filteredResults = response.data.results.filter(item => item.poster_path);
    return filteredResults;
  } catch (error) {
    console.error(`Error fetching recommendations for TV show ${tvId}:`, error);
    return [];
  }
};

export default {
  fetchPopularMovies,
  fetchPopularTVShows,
  fetchNewReleaseMovies,
  fetchNewReleaseTVShows,
  searchMedia,
  fetchMovieDetails,
  fetchTVShowDetails,
  fetchSeasonDetails,
  getImageUrl,
  getHighResImageUrl, // Export the new function
  fetchRecommendedMovies,
  fetchRecommendedTVShows,
  fetchMediaByGenre,
  fetchMovieRecommendations,
  fetchTVShowRecommendations,
};