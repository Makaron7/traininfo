import { useCallback, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, Station, TRACKING_CONFIG, TrainLine } from './train-types';
import { computeAverageStationSpacing, computeEffectiveArrivalThreshold } from './arrival-threshold';

type LocationSample = { latitude: number; longitude: number; speedMps?: number | null };

type DynamicMode = 'near' | 'mid' | 'far';

type UseLocationTrackingParams = {
  selectedStation: Station | null;
  selectedLine: TrainLine | null;
  settings: AppSettings;
  onArrive: (stationName: string) => void;
};

const BACKGROUND_LOCATION_TASK = 'background-location-task';

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

  const trackingMode = useRef<DynamicMode>('near');
  const stationSwitchCandidate = useRef<{ idx: number; hits: number }>({ idx: -1, hits: 0 });
  const hasDepartedFromCurrentStation = useRef(false);
  const hasTriggeredArrivalNotification = useRef(false);
  const foregroundWatchSubscription = useRef<Location.LocationSubscription | null>(null);
  const lineAverageSpacing = useRef<number | null>(null);

  const resolveModeByDistance = (targetDistance: number): DynamicMode => {
    if (targetDistance > TRACKING_CONFIG.DYNAMIC_FAR_DISTANCE) return 'far';
    if (targetDistance > TRACKING_CONFIG.DYNAMIC_MID_DISTANCE) return 'mid';
    return 'near';
  };

  const subscribeWithMode = useCallback(async (mode: DynamicMode) => {
    trackingMode.current = mode;

    const baseOptions =
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

      const platformOptions = Platform.select<Partial<Location.LocationTaskOptions>>({
        android: {
          foregroundService: {
            notificationTitle: 'アラーム実行中',
            notificationBody: '目的地に向かっています',
          },
        },
        ios: {
          showsBackgroundLocationIndicator: true,
        },
        default: {},
      });

      const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (started) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        ...baseOptions,
        ...platformOptions,
      });
    }, []);

  const updateLocation = useCallback(async (sample: LocationSample) => {
    if (!selectedStation || !selectedLine) return;

    const dist = getDistanceFromLatLonInMeters(
      sample.latitude,
      sample.longitude,
      selectedStation.latitude,
      selectedStation.longitude,
    );
    setDistance(Math.floor(dist));

    const nextMode = resolveModeByDistance(dist);
    if (nextMode !== trackingMode.current && isTracking) {
      await subscribeWithMode(nextMode);
    }

    const baseArrivalThreshold = settings.arrivalThreshold ?? TRACKING_CONFIG.ARRIVAL_THRESHOLD_DEFAULT;
    const effectiveArrivalThreshold = computeEffectiveArrivalThreshold(
      baseArrivalThreshold,
      sample.speedMps,
      lineAverageSpacing.current,
    );
    const justArrivedThreshold = TRACKING_CONFIG.CURRENT_STATION_THRESHOLD;
    const departThreshold = Math.max(effectiveArrivalThreshold + 150, TRACKING_CONFIG.DEPARTURE_THRESHOLD);

    if (dist <= justArrivedThreshold) {
      setIsArrived(true);
      if (!hasTriggeredArrivalNotification.current) {
        onArrive(selectedStation.name);
        hasTriggeredArrivalNotification.current = true;
      }
    } else if (dist <= effectiveArrivalThreshold) {
      setIsArrived(true);
    } else if (dist > departThreshold) {
      setIsArrived(false);
      hasTriggeredArrivalNotification.current = false;
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
        sample.latitude,
        sample.longitude,
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
  }, [currentStationIndex, isTracking, onArrive, selectedLine, selectedStation, settings.arrivalThreshold, subscribeWithMode]);

  const startTracking = useCallback(async () => {
    if (!selectedStation || !selectedLine) {
      return;
    }

    try {
      const fgPermission = await Location.getForegroundPermissionsAsync();
      const bgPermission = await Location.getBackgroundPermissionsAsync();

      if (fgPermission.status !== 'granted' || bgPermission.status !== 'granted') {
        Alert.alert(
          '権限エラー',
          '位置情報が「常に許可」になっていません。設定アプリから位置情報権限を変更してください。',
        );
        return;
      }

      lineAverageSpacing.current = computeAverageStationSpacing(selectedLine.stations);

      await Promise.all([
        AsyncStorage.setItem('SelectedTargetStation', JSON.stringify(selectedStation)),
        AsyncStorage.setItem(
          'SelectedLineMeta',
          JSON.stringify({ averageStationSpacing: lineAverageSpacing.current }),
        ),
      ]);
      setIsTracking(true);
      setIsArrived(false);
      hasTriggeredArrivalNotification.current = false;
      stationSwitchCandidate.current = { idx: -1, hits: 0 };
      hasDepartedFromCurrentStation.current = false;

      await subscribeWithMode('near');

      if (foregroundWatchSubscription.current) {
        foregroundWatchSubscription.current.remove();
        foregroundWatchSubscription.current = null;
      }

      foregroundWatchSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: TRACKING_CONFIG.GPS_INTERVAL_NEAR_MS,
          distanceInterval: TRACKING_CONFIG.GPS_DISTANCE_FILTER_NEAR,
        },
        (location) => {
          void updateLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            speedMps: location.coords.speed,
          });
        },
      );

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await updateLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        speedMps: current.coords.speed,
      });
    } catch (error: unknown) {
      setIsTracking(false);
      const message = error instanceof Error ? error.message : '不明なエラーが発生しました';
      Alert.alert('トラッキング起動エラー', message);
    }
  }, [selectedLine, selectedStation, subscribeWithMode, updateLocation]);

  const stopTracking = useCallback(async () => {
    if (foregroundWatchSubscription.current) {
      foregroundWatchSubscription.current.remove();
      foregroundWatchSubscription.current = null;
    }

    const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
    await Promise.all([
      AsyncStorage.removeItem('SelectedTargetStation'),
      AsyncStorage.removeItem('SelectedLineMeta'),
    ]);
    lineAverageSpacing.current = null;
    setIsTracking(false);
    setDistance(null);
    setIsArrived(false);
    setCurrentStationIndex(-1);
    setNearestStationDistance(null);
    hasTriggeredArrivalNotification.current = false;
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
