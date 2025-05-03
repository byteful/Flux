import axios from 'axios';

// Replace with your actual OpenSubtitles API key if required by the specific API endpoint
const API_KEY = '9xkBmnpMy7D3wP9HoxSifWGwJidqY7eO'; // It's free. I don't care that it's public.
const API_URL = 'https://api.opensubtitles.com/api/v1'; // Check the correct API endpoint

const opensubtitlesApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Api-Key': API_KEY,
    'Content-Type': 'application/json',
    // Add User-Agent or other required headers as per OpenSubtitles API documentation
    'User-Agent': 'Flux/1.0',
    'Accept': 'application/json' // Ensure correct Accept header is sent by default
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
    // Construct the query parameters based on OpenSubtitles API requirements
    const params = {
      tmdb_id: tmdbId,
      languages: language,
      order_by: "votes",
      order_direction: "desc"
    };
    if (season !== undefined) params.season_number = season;
    if (episode !== undefined) params.episode_number = episode;

    // Adjust the endpoint path as needed (e.g., /subtitles)
    const response = await opensubtitlesApi.get('/subtitles', { params });

    // Process the response data according to the API structure
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
      sub_format: 'srt' // Specify the desired subtitle format
    });

    // Extract the download link or file content from the response
    if (response.data && response.data.link) {
      // If the API returns a link, fetch the content from that link
      const subtitleContentResponse = await axios.get(response.data.link);
      return subtitleContentResponse.data; // The actual subtitle text (SRT/VTT)
    } else if (response.data && response.data.content) {
       // If the API returns content directly
       return response.data.content;
    } else {
      console.warn('Could not get subtitle download link or content.');
      return null;
    }
  } catch (error) {
    console.error('Error downloading subtitle. Full error object:', JSON.stringify(error, null, 2)); // Log the full error object
    if (error.response) {
      // Axios error with response
      console.error('Download Subtitle - Status:', error.response.status);
      console.error('Download Subtitle - Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Download Subtitle - Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // Axios error without response (network issue, etc.)
      console.error('Download Subtitle - Request Error:', error.request);
    } else {
      // Other errors
      console.error('Download Subtitle - General Error:', error.message);
    }
    return null;
  }
};

// Add other necessary API functions as needed