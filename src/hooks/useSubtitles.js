import { useState, useRef, useCallback } from 'react';
import { searchSubtitles, downloadSubtitle } from '../api/opensubtitlesApi';
import { getLanguageName } from '../utils/languageUtils';
import { saveSubtitleLanguagePreference, getSubtitleLanguagePreference } from '../utils/storage';
import { timeToSeconds } from '../utils/timeUtils';
import parseSrt from 'parse-srt';

export const useSubtitles = (mediaId, mediaType, season, episode) => {
  const [availableLanguages, setAvailableLanguages] = useState({});
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [parsedSubtitles, setParsedSubtitles] = useState([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState('');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [loadingSubtitles, setLoadingSubtitles] = useState(false);

  const lastSubtitleIndexRef = useRef(0);
  const preferredSubtitleLanguageLoadedRef = useRef(null);
  const initialSubtitlePreferenceAppliedRef = useRef(false);

  const loadSubtitlePreference = useCallback(async () => {
    const savedLangPref = await getSubtitleLanguagePreference();
    preferredSubtitleLanguageLoadedRef.current = savedLangPref;
    initialSubtitlePreferenceAppliedRef.current = false;
    return savedLangPref;
  }, []);

  const findSubtitles = useCallback(async () => {
    if (!mediaId || loadingSubtitles) return;
    setLoadingSubtitles(true);
    setAvailableLanguages({});

    const preferredLanguages = ['en', 'es', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh'];
    const languageQueryString = preferredLanguages.join(',');

    try {
      const results = await searchSubtitles(
        mediaId,
        languageQueryString,
        mediaType === 'tv' ? season : undefined,
        mediaType === 'tv' ? episode : undefined
      );

      const bestSubtitlesByLang = {};
      results.forEach(sub => {
        const attr = sub.attributes;
        if (!attr || !attr.language || !attr.files || attr.files.length === 0) {
          return;
        }

        if (attr.foreign_parts_only === true) {
          return;
        }

        const langCode = attr.language;
        const fileInfo = attr.files[0];

        const currentSubInfo = {
          language: langCode,
          languageName: getLanguageName(langCode),
          fileId: fileInfo.file_id,
          releaseName: attr.release,
          downloadCount: attr.download_count || 0,
          fps: attr.fps || -1,
          uploaderName: attr.uploader?.name,
          uploadDate: attr.upload_date,
          legacySubtitleId: attr.legacy_subtitle_id,
          moviehashMatch: attr.moviehash_match === true,
          fromTrusted: attr.from_trusted === true,
          hearingImpaired: attr.hearing_impaired === true,
        };

        const existingBest = bestSubtitlesByLang[langCode];

        if (!existingBest) {
          bestSubtitlesByLang[langCode] = currentSubInfo;
        } else {
          let newIsBetter = false;
          if (currentSubInfo.moviehashMatch && !existingBest.moviehashMatch) {
            newIsBetter = true;
          } else if (!currentSubInfo.moviehashMatch && existingBest.moviehashMatch) {
            newIsBetter = false;
          } else {
            if (currentSubInfo.fromTrusted && !existingBest.fromTrusted) {
              newIsBetter = true;
            } else if (!currentSubInfo.fromTrusted && existingBest.fromTrusted) {
              newIsBetter = false;
            } else {
              if (!currentSubInfo.hearingImpaired && existingBest.hearingImpaired) {
                newIsBetter = true;
              } else if (currentSubInfo.hearingImpaired && !existingBest.hearingImpaired) {
                newIsBetter = false;
              } else {
                if (currentSubInfo.downloadCount > existingBest.downloadCount) {
                  newIsBetter = true;
                }
              }
            }
          }

          if (newIsBetter) {
            bestSubtitlesByLang[langCode] = currentSubInfo;
          }
        }
      });

      setAvailableLanguages(bestSubtitlesByLang);
    } catch (err) {
      console.error("Error searching subtitles:", err);
    } finally {
      setLoadingSubtitles(false);
    }
  }, [mediaId, mediaType, season, episode, loadingSubtitles]);

  const selectSubtitle = useCallback(async (langCode) => {
    if (!langCode) {
      setParsedSubtitles([]);
      setSelectedLanguage(null);
      setCurrentSubtitleText('');
      setSubtitlesEnabled(false);
      saveSubtitleLanguagePreference(null);
      return;
    }

    if (langCode === selectedLanguage) {
      setSubtitlesEnabled(true);
      saveSubtitleLanguagePreference(langCode);
      return;
    }

    const bestSubtitleInfo = availableLanguages[langCode];
    if (!bestSubtitleInfo || !bestSubtitleInfo.fileId) {
      console.error(`Error: No valid subtitle fileId found for language: ${langCode}`);
      setLoadingSubtitles(false);
      return;
    }

    setLoadingSubtitles(true);
    setSelectedLanguage(langCode);
    setParsedSubtitles([]);
    setCurrentSubtitleText('');

    try {
      const srtContent = await downloadSubtitle(bestSubtitleInfo.fileId);

      if (srtContent) {
        const parsed = parseSrt(srtContent);

        const parsedWithSeconds = parsed.map(line => ({
          ...line,
          startSeconds: timeToSeconds(line.start),
          endSeconds: timeToSeconds(line.end),
        }));

        setParsedSubtitles(parsedWithSeconds);
        lastSubtitleIndexRef.current = 0;
        setSubtitlesEnabled(true);
        saveSubtitleLanguagePreference(langCode);
      } else {
        console.warn("Failed to download subtitle content.");
        setSelectedLanguage(null);
        setSubtitlesEnabled(false);
        saveSubtitleLanguagePreference(null);
      }
    } catch (err) {
      console.error("Error during subtitle download or parsing:", err);
      setSelectedLanguage(null);
      setSubtitlesEnabled(false);
      saveSubtitleLanguagePreference(null);
    } finally {
      setLoadingSubtitles(false);
    }
  }, [selectedLanguage, availableLanguages]);

  const updateCurrentSubtitle = useCallback((currentPositionSeconds) => {
    if (!subtitlesEnabled || parsedSubtitles.length === 0) {
      if (currentSubtitleText !== '') setCurrentSubtitleText('');
      return;
    }

    let currentSub = null;
    const lastIdx = lastSubtitleIndexRef.current;

    if (lastIdx < parsedSubtitles.length &&
      currentPositionSeconds >= parsedSubtitles[lastIdx].startSeconds &&
      currentPositionSeconds <= parsedSubtitles[lastIdx].endSeconds) {
      currentSub = parsedSubtitles[lastIdx];
    } else {
      for (let i = Math.max(0, lastIdx - 2); i < Math.min(parsedSubtitles.length, lastIdx + 10); i++) {
        if (currentPositionSeconds >= parsedSubtitles[i].startSeconds &&
          currentPositionSeconds <= parsedSubtitles[i].endSeconds) {
          currentSub = parsedSubtitles[i];
          lastSubtitleIndexRef.current = i;
          break;
        }
      }

      if (!currentSub) {
        let low = 0;
        let high = parsedSubtitles.length - 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const sub = parsedSubtitles[mid];

          if (currentPositionSeconds >= sub.startSeconds && currentPositionSeconds <= sub.endSeconds) {
            currentSub = sub;
            lastSubtitleIndexRef.current = mid;
            break;
          } else if (currentPositionSeconds < sub.startSeconds) {
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }
      }
    }

    let newText = currentSub ? currentSub.text : '';

    if (newText) {
      newText = newText.replace(/<br\s*\/?>/gi, '\n');
      newText = newText.replace(/<\/?(i|b|u|font)[^>]*>/gi, '');
      newText = newText.trim();
    }

    if (newText !== currentSubtitleText) {
      setCurrentSubtitleText(newText);
    }
  }, [subtitlesEnabled, parsedSubtitles, currentSubtitleText]);

  return {
    availableLanguages,
    selectedLanguage,
    parsedSubtitles,
    currentSubtitleText,
    subtitlesEnabled,
    loadingSubtitles,
    preferredSubtitleLanguageLoadedRef,
    initialSubtitlePreferenceAppliedRef,
    setSubtitlesEnabled,
    loadSubtitlePreference,
    findSubtitles,
    selectSubtitle,
    updateCurrentSubtitle,
  };
};
