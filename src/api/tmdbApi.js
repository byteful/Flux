import axios from 'axios';

// Replace with your actual TMDB API key
const TMDB_API_KEY = 'fa953c513c37da857fb3155738358ff0'; // I do not care that this is public. Its free...
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Helper function to create image URLs
export const getImageUrl = (path) => {
  if (!path) return null;
  return `${IMAGE_BASE_URL}${path}`;
};

// Fetch trending content
export const fetchTrending = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/trending/all/week`, {
      params: { api_key: TMDB_API_KEY },
    });
    return response.data.results;
  } catch (error) {
    console.error('Error fetching trending content:', error);
    throw error;
  }
};

// Fetch popular movies
export const fetchPopularMovies = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/movie/popular`, {
      params: { api_key: TMDB_API_KEY },
    });
    return response.data.results;
  } catch (error) {
    console.error('Error fetching popular movies:', error);
    throw error;
  }
};

// Fetch popular TV shows
export const fetchPopularTVShows = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/tv/popular`, {
      params: { api_key: TMDB_API_KEY },
    });
    return response.data.results;
  } catch (error) {
    console.error('Error fetching popular TV shows:', error);
    throw error;
  }
};

// Search for movies and TV shows
export const searchMedia = async (query) => {
  try {
    const response = await axios.get(`${BASE_URL}/search/multi`, {
      params: { api_key: TMDB_API_KEY, query },
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

export default {
  fetchTrending,
  fetchPopularMovies,
  fetchPopularTVShows,
  searchMedia,
  fetchMovieDetails,
  fetchTVShowDetails,
  fetchSeasonDetails,
  getImageUrl,
};