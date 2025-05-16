import axios from 'axios';

const API_KEY = '9xkBmnpMy7D3wP9HoxSifWGwJidqY7eO'; // It's free. I don't care that it's public.
const API_URL = 'https://api.opensubtitles.com/api/v1';

const opensubtitlesApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Api-Key': API_KEY,
    'Content-Type': 'application/json',
    'User-Agent': 'Flux/1.0',
    'Accept': 'application/json'
  }
});

/**
 * Searches for subtitles based on TMDB ID.
 * Refer to OpenSubtitles API documentation for exact parameters.
 * @param {string} tmdbId - The TMDB ID of the movie or show.
 * @param {string} language - The desired language (e.g., 'en').
 * @param {number} [season] - Optional season number for TV shows.
 * @param {number} [episode] - Optional episode number for TV shows.
 * @returns {Promise<Array>} - A promise that resolves to an array of subtitle results.
 */
export const searchSubtitles = async (tmdbId, language = 'en', season, episode) => {
  try {
    const params = {
      tmdb_id: tmdbId,
      languages: language,
      order_by: "votes",
      order_direction: "desc"
    };
    if (season !== undefined) params.season_number = season;
    if (episode !== undefined) params.episode_number = episode;

    const response = await opensubtitlesApi.get('/subtitles', { params });

    if (response.data && response.data.data) {
      return response.data.data; // Assuming the subtitles are in response.data.data
    } else {
      console.warn('No subtitles found or unexpected API response format.');
      return [];
    }
  } catch (error) {
    console.error('Error searching subtitles:', error.response ? error.response.data : error.message);
    return [];
  }
};

/**
 * Downloads a specific subtitle file.
 * Refer to OpenSubtitles API documentation for the download endpoint and parameters.
 * @param {string} fileId - The ID of the subtitle file to download.
 * @returns {Promise<string|null>} - A promise that resolves to the subtitle content (e.g., SRT format) or null on error.
 */
export const downloadSubtitle = async (fileId) => {
  try {
    // This endpoint and structure is based on OpenSubtitles docs
    const response = await opensubtitlesApi.post('/download', {
      file_id: fileId,
      sub_format: 'srt'
    });

    if (response.data && response.data.link) {
      const subtitleContentResponse = await axios.get(response.data.link);
      return subtitleContentResponse.data; // The actual subtitle text (SRT/VTT)
    } else if (response.data && response.data.content) {
       return response.data.content;
    } else {
      console.warn('Could not get subtitle download link or content.');
      return null;
    }
  } catch (error) {
    console.error('Error downloading subtitle. Full error object:', JSON.stringify(error, null, 2));
    if (error.response) {
      console.error('Download Subtitle - Status:', error.response.status);
      console.error('Download Subtitle - Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Download Subtitle - Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('Download Subtitle - Request Error:', error.request);
    } else {
      console.error('Download Subtitle - General Error:', error.message);
    }
    return null;
  }
};