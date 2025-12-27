import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchTVShowDetails, fetchSeasonDetails } from '../api/tmdbApi';
import { getAutoPlaySetting } from '../utils/storage';

const TWO_MINUTE_THRESHOLD_SECONDS = 120;

export const useAutoPlay = ({
  mediaId,
  mediaType,
  season,
  episode,
  title,
  poster_path,
  position,
  duration,
  isLiveStream,
  player,
  navigation,
  handleGoBack,
  setIsUnmounting,
}) => {
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [showNextEpisodeButton, setShowNextEpisodeButton] = useState(false);
  const [isFindingNextEpisode, setIsFindingNextEpisode] = useState(false);
  const nextEpisodeDetailsRef = useRef(null);

  const loadAutoPlaySetting = useCallback(async () => {
    const isEnabled = await getAutoPlaySetting();
    setAutoPlayEnabled(isEnabled);
    return isEnabled;
  }, []);

  const findNextEpisode = useCallback(async () => {
    if (mediaType !== 'tv' || isFindingNextEpisode || showNextEpisodeButton) {
      return;
    }
    setIsFindingNextEpisode(true);
    try {
      const showData = await fetchTVShowDetails(mediaId);
      if (!showData || !showData.seasons) {
        setIsFindingNextEpisode(false);
        return;
      }
      const validSeasons = showData.seasons.filter(s => s.season_number > 0 || showData.seasons.length === 1);
      if (validSeasons.length === 0) {
        setIsFindingNextEpisode(false);
        return;
      }
      const currentSeasonData = validSeasons.find(s => s.season_number === season);
      const currentSeasonIndex = validSeasons.findIndex(s => s.season_number === season);
      let nextEp = null;
      let nextSe = null;
      if (currentSeasonData && episode < currentSeasonData.episode_count) {
        nextSe = season;
        nextEp = episode + 1;
      } else if (currentSeasonIndex !== -1 && currentSeasonIndex < validSeasons.length - 1) {
        const nextSeasonData = validSeasons[currentSeasonIndex + 1];
        if (nextSeasonData && nextSeasonData.episode_count > 0 && nextSeasonData.season_number > 0) {
          nextSe = nextSeasonData.season_number;
          nextEp = 1;
        }
      }
      if (nextSe !== null && nextEp !== null) {
        let episodeName = `Episode ${nextEp}`;
        let nextEpisodeData;
        try {
          const nextSeasonFullDetails = await fetchSeasonDetails(mediaId, nextSe);
          nextEpisodeData = nextSeasonFullDetails?.episodes?.find(e => e.episode_number === nextEp);
          if (nextEpisodeData?.name) {
            episodeName = nextEpisodeData.name;
          }
        } catch (fetchErr) {
          console.warn(`Could not fetch details for S${nextSe} E${nextEp} to get title:`, fetchErr);
        }
        const nextDetails = {
          mediaId: mediaId,
          mediaType: 'tv',
          season: nextSe,
          episode: nextEp,
          title: title,
          episodeTitle: episodeName,
          poster_path: poster_path,
          air_date: nextEpisodeData?.air_date,
        };
        nextEpisodeDetailsRef.current = nextDetails;
        setShowNextEpisodeButton(true);
      } else {
        nextEpisodeDetailsRef.current = null;
        setShowNextEpisodeButton(true);
      }
    } catch (err) {
      console.error("Error finding next episode:", err);
    } finally {
      setIsFindingNextEpisode(false);
    }
  }, [mediaId, mediaType, season, episode, title, poster_path, isFindingNextEpisode, showNextEpisodeButton]);

  const playNextEpisode = useCallback(() => {
    const nextDetails = nextEpisodeDetailsRef.current;
    if (nextDetails) {
      setIsUnmounting(true);
      if (player) player.pause();
      navigation.replace('VideoPlayer', nextDetails);
    } else {
      handleGoBack(true);
    }
  }, [navigation, player, handleGoBack, setIsUnmounting]);

  useEffect(() => {
    if (isLiveStream) return;

    if (duration > 0 && position > 0 && (duration - position) < TWO_MINUTE_THRESHOLD_SECONDS) {
      if (!isFindingNextEpisode && !showNextEpisodeButton) {
        findNextEpisode();
      }
    }
  }, [position, duration, findNextEpisode, isFindingNextEpisode, showNextEpisodeButton, isLiveStream]);

  const reset = useCallback(() => {
    setShowNextEpisodeButton(false);
    nextEpisodeDetailsRef.current = null;
    setIsFindingNextEpisode(false);
  }, []);

  return {
    autoPlayEnabled,
    showNextEpisodeButton,
    isFindingNextEpisode,
    nextEpisodeDetailsRef,
    setAutoPlayEnabled,
    setShowNextEpisodeButton,
    loadAutoPlaySetting,
    findNextEpisode,
    playNextEpisode,
    reset,
  };
};
