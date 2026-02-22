 
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Station, TRACKING_CONFIG } from '@/hooks/train-types';
import { computeEffectiveArrivalThreshold } from '@/hooks/arrival-threshold';

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

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;

    try {
      const [stationRaw, settingsRaw, lineMetaRaw] = await Promise.all([
        AsyncStorage.getItem('SelectedTargetStation'),
        AsyncStorage.getItem('AppSettings'),
        AsyncStorage.getItem('SelectedLineMeta'),
      ]);

      if (!stationRaw) return;

      const targetStation = JSON.parse(stationRaw) as Station;
      const appSettings = settingsRaw ? JSON.parse(settingsRaw) as { arrivalThreshold?: number } : null;
      const baseArrivalThreshold = appSettings?.arrivalThreshold ?? TRACKING_CONFIG.ARRIVAL_THRESHOLD_DEFAULT;

      const latestLocation = (data as { locations?: Location.LocationObject[] })?.locations?.[0];
      if (!latestLocation) return;

      const lineMeta = lineMetaRaw ? JSON.parse(lineMetaRaw) as { averageStationSpacing?: number } : null;
      const effectiveArrivalThreshold = computeEffectiveArrivalThreshold(
        baseArrivalThreshold,
        latestLocation.coords.speed,
        lineMeta?.averageStationSpacing,
      );

      const dist = getDistanceFromLatLonInMeters(
        latestLocation.coords.latitude,
        latestLocation.coords.longitude,
        targetStation.latitude,
        targetStation.longitude,
      );

      if (dist <= effectiveArrivalThreshold) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'まもなく到着',
            body: `${targetStation.name}付近です`,
            sound: 'default',
          },
          trigger: null,
        });

        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {
      // no-op
    }
  });
}
