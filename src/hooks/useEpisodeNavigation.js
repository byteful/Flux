import { useState, useRef, useCallback, useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { fetchTVShowDetails, fetchSeasonDetails } from '../api/tmdbApi';
import { getEpisodeWatchProgress } from '../utils/storage';

export const useEpisodeNavigation = ({
  mediaId,
  mediaType,
  season,
  episode,
  player,
  isPlaying,
  setShowControls,
}) => {
  const [showEpisodesModal, setShowEpisodesModal] = useState(false);
  const [allSeasonsData, setAllSeasonsData] = useState([]);
  const [selectedSeasonForModal, setSelectedSeasonForModal] = useState(null);
  const [episodesForModal, setEpisodesForModal] = useState([]);
  const [isLoadingModalEpisodes, setIsLoadingModalEpisodes] = useState(false);
  const [initialModalScrollDone, setInitialModalScrollDone] = useState(false);

  const seasonListModalRef = useRef(null);
  const episodeListModalRef = useRef(null);
  const episodesModalOrientationListenerRef = useRef(null);

  const fetchAllSeasonsAndEpisodes = useCallback(async () => {
    if (mediaType !== 'tv' || !mediaId) return;
    setIsLoadingModalEpisodes(true);
    try {
      const showData = await fetchTVShowDetails(mediaId);
      if (showData && showData.seasons) {
        const validSeasons = showData.seasons.filter(s => s.season_number > 0 || showData.seasons.length === 1);

        const seasonsWithDetails = await Promise.all(
          validSeasons.map(async (s) => {
            const seasonDetail = await fetchSeasonDetails(mediaId, s.season_number);
            const episodesWithProgress = await Promise.all(
              (seasonDetail?.episodes || []).map(async (ep) => {
                const progress = await getEpisodeWatchProgress(mediaId, s.season_number, ep.episode_number);
                return { ...ep, watchProgress: progress };
              })
            );
            return { ...s, episodes: episodesWithProgress || [] };
          })
        );
        setAllSeasonsData(seasonsWithDetails);
        const currentSeasonInModal = seasonsWithDetails.find(s => s.season_number === season);
        if (currentSeasonInModal) {
          setSelectedSeasonForModal(currentSeasonInModal.season_number);
          setEpisodesForModal(currentSeasonInModal.episodes);
        } else if (seasonsWithDetails.length > 0) {
          setSelectedSeasonForModal(seasonsWithDetails[0].season_number);
          setEpisodesForModal(seasonsWithDetails[0].episodes);
        }
      }
    } catch (err) {
      console.error("Error fetching all seasons for modal:", err);
    } finally {
      setIsLoadingModalEpisodes(false);
    }
  }, [mediaType, mediaId, season]);

  const handleSelectSeasonForModal = useCallback(async (selectedSeasonNumber) => {
    setSelectedSeasonForModal(selectedSeasonNumber);
    setInitialModalScrollDone(false);
    const seasonData = allSeasonsData.find(s => s.season_number === selectedSeasonNumber);
    if (seasonData) {
      setIsLoadingModalEpisodes(true);
      const episodesWithProgress = await Promise.all(
        (seasonData.episodes || []).map(async (ep) => {
          const progress = await getEpisodeWatchProgress(mediaId, selectedSeasonNumber, ep.episode_number);
          return { ...ep, watchProgress: progress };
        })
      );
      setEpisodesForModal(episodesWithProgress);
      setIsLoadingModalEpisodes(false);
    } else {
      setEpisodesForModal([]);
    }
  }, [allSeasonsData, mediaId]);

  const toggleEpisodesModal = useCallback(async () => {
    if (!showEpisodesModal) {
      if (player && isPlaying) {
        try {
          player.pause();
        } catch (e) {
          console.error("Error pausing video on modal open:", e);
        }
      }
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.error("Failed to lock orientation or during delay before opening episodes modal:", e);
      }
      if (mediaType === 'tv') {
        fetchAllSeasonsAndEpisodes();
      }
      setShowEpisodesModal(true);
    } else {
      setShowEpisodesModal(false);
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        console.error("Failed to re-lock to LANDSCAPE on modal toggle-close (button):", e);
      }
    }
    setShowControls(true);
  }, [showEpisodesModal, player, isPlaying, mediaType, fetchAllSeasonsAndEpisodes, setShowControls]);

  useEffect(() => {
    const handleOrientationChange = async (event) => {
      const currentOrientation = event.orientationInfo.orientation;
      if (
        currentOrientation !== ScreenOrientation.Orientation.LANDSCAPE_LEFT &&
        currentOrientation !== ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } catch (e) {
          console.error("Episodes Modal: Failed to re-lock to LANDSCAPE on orientation change:", e);
        }
      }
    };

    if (showEpisodesModal) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        .catch(e => console.error("Episodes Modal: Failed initial lock to LANDSCAPE:", e));

      if (!episodesModalOrientationListenerRef.current) {
        episodesModalOrientationListenerRef.current = ScreenOrientation.addOrientationChangeListener(handleOrientationChange);
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
          .catch(e => console.error("Episodes Modal: Failed aggressive re-lock post-listener add:", e));
      }
    } else {
      if (episodesModalOrientationListenerRef.current) {
        ScreenOrientation.removeOrientationChangeListener(episodesModalOrientationListenerRef.current);
        episodesModalOrientationListenerRef.current = null;
      }
    }

    return () => {
      if (episodesModalOrientationListenerRef.current) {
        ScreenOrientation.removeOrientationChangeListener(episodesModalOrientationListenerRef.current);
        episodesModalOrientationListenerRef.current = null;
      }
    };
  }, [showEpisodesModal]);

  useEffect(() => {
    if (showEpisodesModal && allSeasonsData.length > 0 && selectedSeasonForModal && seasonListModalRef.current) {
      const seasonIndex = allSeasonsData.findIndex(s => s.season_number === selectedSeasonForModal);
      if (seasonIndex !== -1) {
        setTimeout(() => {
          seasonListModalRef.current?.scrollToIndex({
            index: seasonIndex,
            animated: true,
            viewPosition: 0.5,
          });
        }, 200);
      }
    }
  }, [showEpisodesModal, allSeasonsData, selectedSeasonForModal]);

  useEffect(() => {
    if (showEpisodesModal && !initialModalScrollDone && episodesForModal.length > 0 && episodeListModalRef.current) {
      const currentEpisodeIndex = episodesForModal.findIndex(ep =>
        ep.season_number === season && ep.episode_number === episode
      );

      if (currentEpisodeIndex !== -1) {
        setTimeout(() => {
          episodeListModalRef.current?.scrollToIndex({
            index: currentEpisodeIndex,
            animated: true,
            viewPosition: 0.5,
          });
          setInitialModalScrollDone(true);
        }, 300);
      } else {
        setInitialModalScrollDone(true);
      }
    }
  }, [showEpisodesModal, episodesForModal, season, episode, initialModalScrollDone]);

  useEffect(() => {
    if (!showEpisodesModal) {
      setInitialModalScrollDone(false);
    }
  }, [showEpisodesModal]);

  return {
    showEpisodesModal,
    allSeasonsData,
    selectedSeasonForModal,
    episodesForModal,
    isLoadingModalEpisodes,
    seasonListModalRef,
    episodeListModalRef,
    setShowEpisodesModal,
    toggleEpisodesModal,
    handleSelectSeasonForModal,
  };
};
