import { TRACKING_CONFIG } from '@/hooks/train-types';

export const CONFIG = {
  ARRIVING_DISPLAY_THRESHOLD: 280,
  LCD_DISPLAY_COUNT: 5,
  CURRENT_STATION_THRESHOLD: TRACKING_CONFIG.CURRENT_STATION_THRESHOLD,
  STOPPED_STATION_THRESHOLD: TRACKING_CONFIG.STOPPED_STATION_THRESHOLD,
  DEPARTURE_THRESHOLD: TRACKING_CONFIG.DEPARTURE_THRESHOLD,
} as const;

export const LINE_COLORS: Record<string, string> = {
  'JR山手線': '#80C241',
  'JR中央線快速': '#E25E00',
  'JR中央・総武線各駅停車': '#FFD400',
  'JR京浜東北線': '#00B2E5',
  'JR東海道線': '#F68B1E',
  'JR横須賀線': '#0067C0',
  'JR湘南新宿ライン': '#E21F26',
  'JR埼京線': '#00AC9A',
  'JR京葉線': '#C9242F',
  'JR武蔵野線': '#F15A22',
  '京成松戸線': '#EF59A1',
};

export const getLineColor = (name: string): string => {
  if (LINE_COLORS[name]) return LINE_COLORS[name];
  const key = Object.keys(LINE_COLORS).find((lineName) => name.includes(lineName));
  if (key) return LINE_COLORS[key];

  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return `#${'00000'.substring(0, 6 - c.length)}${c}`;
};

export const STATION_NUMBERING: Record<string, Record<string, string>> = {
  'JR山手線': {
    '東京': 'JY-01',
    '神田': 'JY-02',
    '秋葉原': 'JY-03',
    '御徒町': 'JY-04',
    '上野': 'JY-05',
  },
  '東京メトロ銀座線': {
    '渋谷': 'G-01',
    '表参道': 'G-02',
    '外苑前': 'G-03',
    '青山一丁目': 'G-04',
    '赤坂見附': 'G-05',
  },
};

export const getStationNumber = (lineName: string | undefined, stationName: string): string | null => {
  if (!lineName || !STATION_NUMBERING[lineName]) return null;
  return STATION_NUMBERING[lineName][stationName] || null;
};
