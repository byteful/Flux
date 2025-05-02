import axios from 'axios';

// Replace with your actual TMDB API key
const TMDB_API_KEY = 'fa953c513c37da857fb3155738358ff0'; // I do not care that this is public. Its free...
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const HIGH_RES_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w1280'; // Added for higher resolution

// Define popular US providers (Netflix, Prime Video, Hulu, Disney+, Max)
const US_PROVIDERS_STRING = '8|9|15|337|1899';
const US_REGION = 'US';

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
      },
    });
    // Filter out results without a poster_path for better UI presentation
    const filteredResults = response.data.results.filter(item => item.poster_path);
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
      },
    });
    // Filter out results without a poster_path for better UI presentation
    const filteredResults = response.data.results.filter(item => item.poster_path);
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
    return response.data.results;
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
        ...params // Spread additional filter parameters (like with_genres)
      },
    });
    // Filter out results without a poster_path for better UI presentation
    const filteredResults = response.data.results.filter(item => item.poster_path);
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
        ...params // Spread additional filter parameters (like with_genres)
      },
    });
    // Filter out results without a poster_path for better UI presentation
    const filteredResults = response.data.results.filter(item => item.poster_path);
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
        ...params,
      },
    });
    // Filter out results without a poster_path for better UI presentation
    const filteredResults = response.data.results.filter(item => item.poster_path);
    return filteredResults;
  } catch (error) {
    console.error(`Error fetching ${mediaType} by genre ${genreId}:`, error);
    throw error;
  }
};

export default {
  fetchPopularMovies,
  fetchPopularTVShows,
  searchMedia,
  fetchMovieDetails,
  fetchTVShowDetails,
  fetchSeasonDetails,
  getImageUrl,
  getHighResImageUrl, // Export the new function
  fetchRecommendedMovies,
  fetchRecommendedTVShows,
  fetchMediaByGenre,
};