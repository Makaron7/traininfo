export interface Station {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface TrainLine {
  id: string;
  name: string;
  stations: Station[];
  color: string;
}

export interface AppSettings {
  soundOnlyWithHeadphones: boolean;
  vibrationEnabled: boolean;
  arrivalThreshold: number;
}

export interface HeartRailsStation {
  name: string;
  y: string;
  x: string;
  line?: string;
  prefecture?: string;
}

export interface HeartRailsResponse {
  response: {
    station: HeartRailsStation[];
  } | null;
}

export const TRACKING_CONFIG = {
  GPS_INTERVAL_NEAR_MS: 1000,
  GPS_INTERVAL_MID_MS: 3000,
  GPS_INTERVAL_FAR_MS: 10000,
  GPS_DISTANCE_FILTER_NEAR: 10,
  GPS_DISTANCE_FILTER_FAR: 30,
  ARRIVAL_THRESHOLD_DEFAULT: 300,
  CURRENT_STATION_THRESHOLD: 150,
  STOPPED_STATION_THRESHOLD: 75,
  DEPARTURE_THRESHOLD: 600,
  DYNAMIC_FAR_DISTANCE: 5000,
  DYNAMIC_MID_DISTANCE: 2000,
  EARTH_RADIUS: 6371000,
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  soundOnlyWithHeadphones: true,
  vibrationEnabled: true,
  arrivalThreshold: TRACKING_CONFIG.ARRIVAL_THRESHOLD_DEFAULT,
};
