import { Station } from './train-types';

const MIN_EFFECTIVE_THRESHOLD = 220;
const MAX_EFFECTIVE_THRESHOLD = 1300;

const getSpeedAdjustment = (speedMps: number | null | undefined): number => {
  if (speedMps == null || Number.isNaN(speedMps) || speedMps <= 0) return 0;

  const speedKmh = speedMps * 3.6;
  if (speedKmh >= 80) return 180;
  if (speedKmh >= 60) return 120;
  if (speedKmh >= 40) return 60;
  if (speedKmh < 15) return -80;
  return 0;
};

const getLineAdjustment = (averageStationSpacing: number | null | undefined): number => {
  if (averageStationSpacing == null || Number.isNaN(averageStationSpacing) || averageStationSpacing <= 0) {
    return 0;
  }

  if (averageStationSpacing >= 1800) return 120;
  if (averageStationSpacing >= 1200) return 60;
  if (averageStationSpacing <= 450) return -140;
  if (averageStationSpacing <= 700) return -80;
  return 0;
};

export const computeAverageStationSpacing = (stations: Station[]): number | null => {
  if (stations.length < 2) return null;

  let sum = 0;
  let count = 0;

  for (let index = 1; index < stations.length; index += 1) {
    const previous = stations[index - 1];
    const current = stations[index];

    const dLat = (current.latitude - previous.latitude) * (Math.PI / 180);
    const dLon = (current.longitude - previous.longitude) * (Math.PI / 180);
    const prevLat = previous.latitude * (Math.PI / 180);
    const currLat = current.latitude * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(prevLat) * Math.cos(currLat) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (Number.isFinite(distance) && distance > 0) {
      sum += distance;
      count += 1;
    }
  }

  if (count === 0) return null;
  return sum / count;
};

export const computeEffectiveArrivalThreshold = (
  baseThreshold: number,
  speedMps: number | null | undefined,
  averageStationSpacing: number | null | undefined,
): number => {
  const tuned = baseThreshold + getSpeedAdjustment(speedMps) + getLineAdjustment(averageStationSpacing);
  return Math.max(MIN_EFFECTIVE_THRESHOLD, Math.min(MAX_EFFECTIVE_THRESHOLD, Math.round(tuned)));
};
