export const formatTime = (timeInSeconds, allowNegative = false) => {
  if (isNaN(timeInSeconds)) return '00:00';

  const isNegative = timeInSeconds < 0;
  const absTime = Math.abs(timeInSeconds);

  const hours = Math.floor(absTime / 3600);
  const minutes = Math.floor((absTime % 3600) / 60);
  const seconds = Math.floor(absTime % 60);
  const formattedHours = String(hours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(seconds).padStart(2, '0');

  const timeString = hours > 0
    ? `${formattedHours}:${formattedMinutes}:${formattedSeconds}`
    : `${formattedMinutes}:${formattedSeconds}`;

  return (isNegative && allowNegative) ? `${timeString}` : timeString;
};

export const formatRuntime = (minutes) => {
  if (!minutes || isNaN(minutes)) return '';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
};

export const timeToSeconds = (timeInput) => {
  if (typeof timeInput === 'number' && !isNaN(timeInput)) {
    return timeInput;
  }

  if (typeof timeInput !== 'string' || !timeInput) {
    return 0;
  }

  try {
    const timeString = timeInput;
    const parts = timeString.split(':');
    if (parts.length !== 3) throw new Error('Invalid time format (parts)');
    const secondsAndMs = parts[2].split(',');
    if (secondsAndMs.length !== 2) throw new Error('Invalid time format (ms)');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(secondsAndMs[0], 10);
    const milliseconds = parseInt(secondsAndMs[1], 10);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
      throw new Error('Invalid number parsed from string parts');
    }
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  } catch (e) {
    console.error(`Error parsing time string "${timeInput}":`, e);
    return 0;
  }
};

export const isFutureDate = (airDateString) => {
  if (!airDateString) return false;
  const airDate = new Date(airDateString);
  const today = new Date();
  return airDate > today;
};
