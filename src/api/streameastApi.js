import axios from 'axios';
import * as cheerio from 'cheerio';

// TODO: Populate this map with actual sport logo URLs
// This maps sport tokens (e.g., 'NFL', 'NBA') to their respective logo URLs
export const SPORT_LOGO_MAP = {
  'NFL': 'https://cdn.freebiesupply.com/logos/large/2x/nfl-logo.png',
  'NBA': 'https://cdn.freebiesupply.com/images/large/2x/nba-logo-transparent.png',
  'MLB': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Major_League_Baseball_logo.svg/1200px-Major_League_Baseball_logo.svg.png',
  'NHL': 'https://1000logos.net/wp-content/uploads/2017/05/NHL-Logo.png',
  'MLS': 'https://cdn.freebiesupply.com/images/large/2x/mls-logo-png-transparent.png',
  'UFC': 'https://1000logos.net/wp-content/uploads/2017/06/Logo-UFC.png',
  'F1': 'https://logos-world.net/wp-content/uploads/2023/12/F1-Logo.png',
  'CFB': 'https://a.espncdn.com/combiner/i?img=/redesign/assets/img/icons/ESPN-icon-football-college.png&w=288&h=288&transparent=true',
  'DEFAULT': 'https://t3.ftcdn.net/jpg/06/71/33/46/360_F_671334604_ZBV26w9fERX8FCLUyDrCrLrZG6bq7h0Q.jpg',
};

const STREAMEAST_BASE_URL = 'https://v2.streameast.ga';

/**
 * Helper function to determine sport token from title or URL
 * @param {string} title - Event title
 * @param {string} url - Event URL
 * @param {string} sportId - Sport ID from scraped data
 * @returns {string} Sport token (e.g., 'NFL', 'NBA', 'DEFAULT')
 */
export const determineSportToken = (title = '', url = '', sportId = '') => {
  // First check if we have a direct sportId
  if (sportId) {
    const upperSportId = sportId.toUpperCase();
    if (['NFL', 'NBA', 'MLB', 'NHL', 'UFC', 'F1', 'CFB', 'BOXING', 'SOCCER'].includes(upperSportId)) {
      return upperSportId;
    }
    if (upperSportId === 'MLS') return 'SOCCER';
  }
  
  const combined = `${title} ${url}`.toUpperCase();
  
  if (combined.includes('NFL') || combined.includes('/NFL')) return 'NFL';
  if (combined.includes('NBA') || combined.includes('/NBA')) return 'NBA';
  if (combined.includes('MLB') || combined.includes('/MLB')) return 'MLB';
  if (combined.includes('NHL') || combined.includes('/NHL')) return 'NHL';
  if (combined.includes('MLS') || combined.includes('SOCCER') || combined.includes('/SOCCER')) return 'SOCCER';
  if (combined.includes('UFC') || combined.includes('MMA') || combined.includes('/UFC')) return 'UFC';
  if (combined.includes('BOXING') || combined.includes('/BOXING')) return 'BOXING';
  if (combined.includes('F1') || combined.includes('/F1')) return 'F1';
  if (combined.includes('CFB') || combined.includes('/CFB')) return 'CFB';
  
  return 'DEFAULT';
};

/**
 * Get display name for a sport token
 * @param {string} sportToken - Sport token (e.g., 'NFL', 'NBA')
 * @returns {string} Display name for the sport
 */
export const getSportDisplayName = (sportToken) => {
  const displayNames = {
    'NFL': 'NFL',
    'NBA': 'NBA',
    'MLB': 'MLB',
    'NHL': 'NHL',
    'MLS': 'MLS',
    'UFC': 'UFC',
    'BOXING': 'Boxing',
    'SOCCER': 'Soccer',
    'F1': 'Formula 1',
    'CFB': 'College Football',
    'DEFAULT': 'Other Sports',
  };
  return displayNames[sportToken] || sportToken;
};

/**
 * Fetches available live streams from StreamEast homepage
 * @returns {Promise<Array>} Array of live stream objects
 */
export const fetchLiveStreams = async () => {
  try {
    // console.log('[StreamEast] Fetching live streams from:', STREAMEAST_BASE_URL);
    
    // Fetch the homepage HTML
    const response = await axios.get(STREAMEAST_BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000,
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    const games = [];
    
    // Find all sport sections
    $('.se-sport-section').each((index, section) => {
      // Get sport ID from the section header
      const sportId = $(section).find('h3.se-sport-name').text().trim();
      
      // Find all match cards within this sport section
      $(section).find('a.uefa-card').each((idx, card) => {
        const $card = $(card);
        
        // Get the direct URL
        let directURL = $card.attr('href') || '';
        
        // Make sure URL is absolute
        if (directURL && !directURL.startsWith('http')) {
          directURL = directURL.startsWith('/') 
            ? `${STREAMEAST_BASE_URL}${directURL}` 
            : `${STREAMEAST_BASE_URL}/${directURL}`;
        }
        
        // Check if it's a two-team match or single event
        const teamsDiv = $card.find('.uefa-teams');
        let title = '';
        
        if (teamsDiv.hasClass('two-teams')) {
          // Two-team match (vs format)
          const teamElements = $card.find('.uefa-team .uefa-name');
          
          if (teamElements.length >= 2) {
            const team1 = $(teamElements[0]).text().trim();
            const team2 = $(teamElements[1]).text().trim();
            title = `${team1} vs ${team2}`;
          } else {
            title = 'Unknown Match';
          }
        } else if (teamsDiv.hasClass('single-team')) {
          // Single event (like F1 races, UFC events)
          const eventName = $card.find('.uefa-team .uefa-name').text().trim();
          title = eventName || 'Unknown Event';
        } else {
          // Fallback
          title = 'Unknown Event';
        }
        
        // Get match time to determine if it's live
        const matchTime = $card.attr('data-time');
        const currentTime = Math.floor(Date.now() / 1000);
        const isLive = matchTime ? (parseInt(matchTime) <= currentTime && parseInt(matchTime) > currentTime - 14400) : false; // Within 4 hours
        
        // Determine sport token
        const sportToken = determineSportToken(title, directURL, sportId);
        
        // Generate unique ID
        const id = `streameast-${sportId.toLowerCase()}-${idx}-${Date.now()}`;
        
        games.push({
          id,
          title,
          streameastUrl: directURL,
          sportToken,
          isLive,
          sportId,
          matchTime: matchTime ? parseInt(matchTime) : null,
        });
      });
    });
    
    // console.log(`[StreamEast] Found ${games.length} streams`);
    return games;
    
  } catch (error) {
    console.error('[StreamEast] Error fetching live streams:', error.message);
    if (error.response) {
      console.error('[StreamEast] Response status:', error.response.status);
    }
    return [];
  }
};

/**
 * Extracts the m3u8 stream URL from a StreamEast event page by following the decryption chain
 * @param {string} streameastUrl - The full URL to the StreamEast event page
 * @returns {Promise<{url: string, referer: string}>} Stream URL and referer
 */
export const extractM3U8Direct = async (streameastUrl) => {
  try {
    // Step 1: Get the initial page source
    const initialResponse = await axios.get(streameastUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      timeout: 10000,
    });
    
    const html = initialResponse.data;
    
    // Step 2: Extract the .php URL from src attribute
    const phpUrlMatch = html.match(/src=["']([^"']*\.php[^"']*)["']/);
    if (!phpUrlMatch) {
      throw new Error('Could not find .php embed URL');
    }
    
    let phpUrl = phpUrlMatch[1];
    // Make absolute URL if relative
    if (phpUrl.startsWith('//')) {
      phpUrl = 'https:' + phpUrl;
    } else if (phpUrl.startsWith('/')) {
      const baseUrl = new URL(streameastUrl);
      phpUrl = baseUrl.origin + phpUrl;
    }

    // Step 3: Get the PHP page to find the iframe
    const phpResponse = await axios.get(phpUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': streameastUrl,
      },
      timeout: 10000,
    });
    
    const phpHtml = phpResponse.data;

    // Step 4: Extract the streamcenter.pro iframe URL
    const iframeMatch = phpHtml.match(/[^\s"']+\/hls\.php\?stream=[^"'\s]+/);
    if (!iframeMatch) {
      throw new Error('Could not find iframe URL');
    }
    
    const iframeUrl = "https:" + iframeMatch[0];

    // Step 5: Fetch the iframe page with the PHP URL as referer
    const iframeResponse = await axios.get(iframeUrl, {
      headers: {
        'Referer': phpUrl,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 10000,
    });
    
    const iframeHtml = iframeResponse.data;

    const inputMatch = iframeHtml.match(/input:\s*["']([^"']+)["']/);
    if (!inputMatch) {
      throw new Error('Could not find encrypted input value');
    }
    
    const encryptedInput = inputMatch[1];

    // Step 7: Call decrypt.php to get the actual m3u8 URL
    const iframeBaseUrl = new URL(iframeUrl).origin + '/embed';
    const decryptUrl = `${iframeBaseUrl}/decrypt.php`;
    
    const decryptResponse = await axios.post(
      decryptUrl,
      new URLSearchParams({
        input: encryptedInput
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': iframeUrl,
          'Origin': new URL(iframeUrl).origin,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      }
    );

    const decryptedUrl = decryptResponse.data.trim();
    
    if (!decryptedUrl || decryptedUrl === '') {
      throw new Error('Decryption returned empty response');
    }
    
    return {
      url: decryptedUrl,
      referer: iframeUrl,
    };
  } catch (error) {
    console.error('[StreamEast] Error extracting m3u8:', error.message);
    throw error;
  }
};

/**
 * Extracts the m3u8 stream URL from a specific StreamEast event page
 * This function supports both direct extraction and WebView-based fallback
 * @param {string} streameastUrl - The full URL to the StreamEast event page
 * @param {Function} onStreamFound - Callback when stream is found (streamUrl, referer, sourceName)
 * @param {Function} onSourceError - Callback when an error occurs (error, sourceName)
 * @param {Function} onManualInterventionRequired - Callback when manual intervention is needed (url, sourceName)
 * @param {Function} provideWebViewConfigForAttempt - Callback to provide WebView config for rendering
 */
export const extractLiveStreamM3U8 = async (
  streameastUrl,
  onStreamFound,
  onSourceError,
  onManualInterventionRequired,
  provideWebViewConfigForAttempt
) => {
  try {
    // First try direct extraction
    const result = await extractM3U8Direct(streameastUrl);
    
    if (result && result.url) {
      onStreamFound(result.url, result.referer, 'streameast.ga');
      return;
    }
  } catch (error) {
    console.warn('[StreamEast] Direct extraction failed, falling back to WebView method:', error.message);
  }
  
  // Fallback to WebView-based extraction if direct method fails
  try {
    const { extractLiveStream } = require('../utils/streamExtractor');
    
    extractLiveStream(
      streameastUrl,
      'streameast.ga',
      15,
      onStreamFound,
      onSourceError,
      onManualInterventionRequired,
      provideWebViewConfigForAttempt
    );
  } catch (fallbackError) {
    console.error('[StreamEast] Both extraction methods failed');
    onSourceError(fallbackError, 'streameast.ga');
  }
};

export default {
  fetchLiveStreams,
  extractLiveStreamM3U8,
  extractM3U8Direct,
  determineSportToken,
  getSportDisplayName,
  SPORT_LOGO_MAP,
};