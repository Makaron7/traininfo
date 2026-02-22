import { useCallback, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { AppSettings, Station, TRACKING_CONFIG, TrainLine } from './train-types';

type Coords = { latitude: number; longitude: number };

type DynamicMode = 'near' | 'mid' | 'far';

type UseLocationTrackingParams = {
  selectedStation: Station | null;
  selectedLine: TrainLine | null;
  settings: AppSettings;
  onArrive: (stationName: string) => void;
};

const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const radius = TRACKING_CONFIG.EARTH_RADIUS;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const useLocationTracking = ({ selectedStation, selectedLine, settings, onArrive }: UseLocationTrackingParams) => {
  const [isTracking, setIsTracking] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [isArrived, setIsArrived] = useState(false);
  const [currentStationIndex, setCurrentStationIndex] = useState(-1);
  const [nearestStationDistance, setNearestStationDistance] = useState<number | null>(null);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const trackingMode = useRef<DynamicMode>('near');
  const stationSwitchCandidate = useRef<{ idx: number; hits: number }>({ idx: -1, hits: 0 });
  const hasDepartedFromCurrentStation = useRef(false);

  const resolveModeByDistance = (targetDistance: number): DynamicMode => {
    if (targetDistance > TRACKING_CONFIG.DYNAMIC_FAR_DISTANCE) return 'far';
    if (targetDistance > TRACKING_CONFIG.DYNAMIC_MID_DISTANCE) return 'mid';
    return 'near';
  };

  const subscribeWithMode = useCallback(async (mode: DynamicMode) => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    trackingMode.current = mode;

    const options =
      mode === 'far'
        ? {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: TRACKING_CONFIG.GPS_INTERVAL_FAR_MS,
            distanceInterval: TRACKING_CONFIG.GPS_DISTANCE_FILTER_FAR,
          }
        : mode === 'mid'
          ? {
              accuracy: Location.Accuracy.High,
              timeInterval: TRACKING_CONFIG.GPS_INTERVAL_MID_MS,
              distanceInterval: TRACKING_CONFIG.GPS_DISTANCE_FILTER_FAR,
            }
          : {
              accuracy: Location.Accuracy.High,
              timeInterval: TRACKING_CONFIG.GPS_INTERVAL_NEAR_MS,
              distanceInterval: TRACKING_CONFIG.GPS_DISTANCE_FILTER_NEAR,
            };

    locationSubscription.current = await Location.watchPositionAsync(options, (location) => {
      void updateLocation(location.coords);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation, selectedLine, currentStationIndex, settings.arrivalThreshold, onArrive]);

  const updateLocation = useCallback(async (coords: Coords) => {
    if (!selectedStation || !selectedLine) return;

    const dist = getDistanceFromLatLonInMeters(
      coords.latitude,
      coords.longitude,
      selectedStation.latitude,
      selectedStation.longitude,
    );
    setDistance(Math.floor(dist));

    const nextMode = resolveModeByDistance(dist);
    if (nextMode !== trackingMode.current && isTracking) {
      await subscribeWithMode(nextMode);
    }

    const arrivalThreshold = settings.arrivalThreshold ?? TRACKING_CONFIG.ARRIVAL_THRESHOLD_DEFAULT;
    const justArrivedThreshold = TRACKING_CONFIG.CURRENT_STATION_THRESHOLD;
    const departThreshold = Math.max(arrivalThreshold + 150, TRACKING_CONFIG.DEPARTURE_THRESHOLD);

    if (dist <= justArrivedThreshold && !isArrived) {
      setIsArrived(true);
      onArrive(selectedStation.name);
    } else if (dist <= arrivalThreshold) {
      setIsArrived(true);
    } else if (dist > departThreshold) {
      setIsArrived(false);
    }

    const stations = selectedLine.stations;
    let start = 0;
    let end = stations.length;

    if (currentStationIndex >= 0 && stations.length > 30) {
      const searchRange = 15;
      start = Math.max(0, currentStationIndex - searchRange);
      end = Math.min(stations.length, currentStationIndex + searchRange);
    }

    let nearestIdx = currentStationIndex >= 0 ? currentStationIndex : 0;
    let minDistance = Number.POSITIVE_INFINITY;

    for (let index = start; index < end; index += 1) {
      const station = stations[index];
      const stationDistance = getDistanceFromLatLonInMeters(
        coords.latitude,
        coords.longitude,
        station.latitude,
        station.longitude,
      );
      if (stationDistance < minDistance) {
        minDistance = stationDistance;
        nearestIdx = index;
      }
    }

    setNearestStationDistance(Math.floor(minDistance));

    if (currentStationIndex < 0 && nearestIdx !== currentStationIndex) {
      setCurrentStationIndex(nearestIdx);
      stationSwitchCandidate.current = { idx: -1, hits: 0 };
      hasDepartedFromCurrentStation.current = false;
      return;
    }

    if (minDistance <= TRACKING_CONFIG.STOPPED_STATION_THRESHOLD) {
      if (nearestIdx === currentStationIndex) {
        hasDepartedFromCurrentStation.current = false;
      }

      if (stationSwitchCandidate.current.idx === nearestIdx) {
        stationSwitchCandidate.current.hits += 1;
      } else {
        stationSwitchCandidate.current = { idx: nearestIdx, hits: 1 };
      }

      const isAdjacent = currentStationIndex < 0 || Math.abs(nearestIdx - currentStationIndex) <= 1;
      const canSwitch =
        stationSwitchCandidate.current.hits >= 2 &&
        nearestIdx !== currentStationIndex &&
        hasDepartedFromCurrentStation.current &&
        isAdjacent;

      if (canSwitch) {
        setCurrentStationIndex(nearestIdx);
        stationSwitchCandidate.current = { idx: -1, hits: 0 };
        hasDepartedFromCurrentStation.current = false;
      }
    } else {
      hasDepartedFromCurrentStation.current = true;
      stationSwitchCandidate.current = { idx: -1, hits: 0 };
    }
  }, [currentStationIndex, isArrived, isTracking, onArrive, selectedLine, selectedStation, settings.arrivalThreshold, subscribeWithMode]);

  const startTracking = useCallback(async () => {
    if (!selectedStation) return;
    setIsTracking(true);
    setIsArrived(false);
    stationSwitchCandidate.current = { idx: -1, hits: 0 };
    hasDepartedFromCurrentStation.current = false;
    await subscribeWithMode('near');
  }, [selectedStation, subscribeWithMode]);

  const stopTracking = useCallback(async () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    setIsTracking(false);
    setDistance(null);
    setIsArrived(false);
    setCurrentStationIndex(-1);
    setNearestStationDistance(null);
    stationSwitchCandidate.current = { idx: -1, hits: 0 };
    hasDepartedFromCurrentStation.current = false;
  }, []);

  return {
    isTracking,
    distance,
    isArrived,
    currentStationIndex,
    nearestStationDistance,
    startTracking,
    stopTracking,
    updateLocation,
    setDistance,
    setNearestStationDistance,
    setIsArrived,
  };
};
