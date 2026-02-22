import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  StatusBar,
  StyleSheet, Text,
  TextInput, TouchableOpacity,
  useColorScheme,
  Vibration,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- 型定義 (Type Safety) ---
interface Station {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface TrainLine {
  id: string;
  name: string;
  stations: Station[];
  color: string;
}

interface DisplayStation extends Station {
  status: 'passed' | 'current' | 'future';
  numbering?: string;
}

interface HeartRailsStation {
  name: string;
  y: string;
  x: string;
  line?: string;
  prefecture?: string;
}

interface HeartRailsResponse {
  response: {
    station: HeartRailsStation[];
  } | null;
}

// 設定型
interface AppSettings {
  soundOnlyWithHeadphones: boolean;
  vibrationEnabled: boolean;
  arrivalThreshold: number;
}

// --- 定数管理 ---
const CONFIG = {
  GPS_INTERVAL_MS: 1000,
  GPS_DISTANCE_FILTER: 10,
  ARRIVAL_THRESHOLD: 500,
  CURRENT_STATION_THRESHOLD: 150,
  DEPARTURE_THRESHOLD: 600,
  EARTH_RADIUS: 6371000,
  LCD_DISPLAY_COUNT: 5,
};

const ANDROID_CHANNEL_ID = 'train-alarm-v2';
const NOTIFICATION_REPEAT_COUNT = 1; // 通知は1回だけ
const NOTIFICATION_REPEAT_INTERVAL_SECONDS = 3; // 予備: 将来複数に戻す場合用
const NOTIFICATION_COOLDOWN_MS = 5000; // 連打防止のクールダウン
const NOTIFICATION_PATTERN_DURATION_MS = Platform.OS === 'android' ? 1800 : 1200; // 3連バイブの所要時間を考慮
const EXTRA_VIBRATION_ROUNDS = 10; // 通知1件に対し追加で鳴らす回数
const EXTRA_VIBRATION_GAP_MS = 1200; // 追加バイブ間の休止
const VIBRATION_PATTERN_STRONG = [0, 800, 200, 800, 200, 800];

const DEFAULT_SETTINGS: AppSettings = {
  soundOnlyWithHeadphones: true,
  vibrationEnabled: true,
  arrivalThreshold: 500,
};

// --- 通知設定 ---
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// --- テーマ型定義 ---
type ThemeColors = {
  background: string;
  text: string;
  card: string;
  border: string;
  subText: string;
  lcdBg: string;
  lcdText: string;
  lcdSubText: string;
  lcdBorder: string;
  modalBg: string;
};

// --- テーマ設定 ---
const Colors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    background: '#f2f2f7',
    text: '#000',
    card: '#fff',
    border: '#e5e5ea',
    subText: '#8e8e93',
    lcdBg: '#fff',
    lcdText: '#000',
    lcdSubText: '#666',
    lcdBorder: '#d1d1d6',
    modalBg: '#fff',
  },
  dark: {
    background: '#000',
    text: '#fff',
    card: '#1c1c1e',
    border: '#3a3a3c',
    subText: '#8e8e93',
    lcdBg: '#121212',
    lcdText: '#fff',
    lcdSubText: '#aaa',
    lcdBorder: '#333',
    modalBg: '#1c1c1e',
  }
};

// --- 路線カラー辞書 ---
const LINE_COLORS: { [key: string]: string } = {
  /* ===== JR 東日本・首都圏 ===== */
  "JR山手線": "#80C241",
  "JR中央線快速": "#E25E00",
  "JR中央・総武線各駅停車": "#FFD400",
  "JR京浜東北線": "#00B2E5",
  "JR東海道線": "#F68B1E",
  "JR横須賀線": "#0067C0",
  "JR湘南新宿ライン": "#E21F26",
  "JR埼京線": "#00AC9A",
  "JR京葉線": "#C9242F",
  "JR武蔵野線": "#F15A22",
  "JR常磐線快速": "#00B261",
  "JR常磐線各駅停車": "#00B261",
  "JR南武線": "#FFD400",
  "JR横浜線": "#9ACD32",
  "JR根岸線": "#00B2E5",
  "JR相模線": "#00B48D",
  "JR青梅線": "#E25E00",
  "JR五日市線": "#E25E00",
  "JR高崎線": "#F68B1E",
  "JR宇都宮線": "#F68B1E",
  "JR上野東京ライン": "#F68B1E",

  /* ===== 東京メトロ ===== */
  "東京メトロ銀座線": "#FF9500",
  "東京メトロ丸ノ内線": "#F62E36",
  "東京メトロ日比谷線": "#B5B5AC",
  "東京メトロ東西線": "#009BBF",
  "東京メトロ千代田線": "#00BB85",
  "東京メトロ有楽町線": "#C1A470",
  "東京メトロ半蔵門線": "#8F76D6",
  "東京メトロ南北線": "#00AC9B",
  "東京メトロ副都心線": "#9C5E31",

  /* ===== 都営 ===== */
  "都営浅草線": "#E85298",
  "都営三田線": "#0079C2",
  "都営新宿線": "#6CBB5A",
  "都営大江戸線": "#B6007A",

  /* ===== 私鉄（首都圏） ===== */
  "東急東横線": "#DA0442",
  "東急田園都市線": "#2C8C2C",
  "東急目黒線": "#00A0DF",
  "東急池上線": "#F18B00",
  "東急大井町線": "#F18B00",

  "小田急小田原線": "#005BAC",
  "小田急江ノ島線": "#00A3E0",
  "小田急多摩線": "#7AC143",

  "京王線": "#DD0077",
  "京王井の頭線": "#2E8B57",

  "京急本線": "#0072C6",
  "京急空港線": "#00AEEF",

  "西武池袋線": "#FF8C00",
  "西武新宿線": "#00A550",

  "東武東上線": "#003A8F",
  "東武伊勢崎線": "#E50012",
  "東武野田線": "#00A0DF",

  "相鉄本線": "#1C3F94",
  "相鉄いずみ野線": "#2EB6E8",

  "つくばエクスプレス": "#D7006D",
  "ゆりかもめ": "#009FE8",
  "りんかい線": "#004C97",

  "京成本線": "#005BAC",
  "京成押上線": "#005BAC",
  "京成金町線": "#005BAC",
  "京成千葉線": "#005BAC",
  "京成千原線": "#005BAC",
  "京成松戸線": "#EF59A1",
  "京成成田空港線（成田スカイアクセス）": "#F39700",
  "北総線": "#008B8F",
  "新京成線": "#EE86A6",
  "東葉高速線": "#FF9900",
  "多摩モノレール": "#009641",
  
  /* ===== JR 西日本・関西 ===== */
  "JR大阪環状線": "#F44336",
  "JR京都線": "#0072C6",
  "JR神戸線": "#0072C6",
  "JR宝塚線": "#F68B1E",
  "JR学研都市線": "#E60012",
  "JR阪和線": "#F68B1E",
  "JR関西空港線": "#003A8F",

  /* ===== 大阪メトロ ===== */
  "大阪メトロ御堂筋線": "#E5171F",
  "大阪メトロ谷町線": "#522886",
  "大阪メトロ四つ橋線": "#0078BA",
  "大阪メトロ中央線": "#019A66",
  "大阪メトロ千日前線": "#E44D93",
  "大阪メトロ堺筋線": "#66473B",
  "大阪メトロ長堀鶴見緑地線": "#A2C62C",
  "大阪メトロ今里筋線": "#F6A800",

  /* ===== 私鉄（関西） ===== */
  "阪急神戸線": "#8B0000",
  "阪急宝塚線": "#8B0000",
  "阪急京都線": "#8B0000",

  "阪神本線": "#005BAC",
  "近鉄奈良線": "#E60012",
  "近鉄大阪線": "#E60012",
  "近鉄名古屋線": "#E60012",

  "京阪本線": "#00A65A",
  "南海本線": "#0066B3",

  /* ===== 名古屋 ===== */
  "名古屋市営地下鉄東山線": "#F39800",
  "名古屋市営地下鉄名城線": "#9B7CB6",
  "名古屋市営地下鉄鶴舞線": "#00A0A0",
  "名古屋市営地下鉄桜通線": "#E60012",

  /* ===== 札幌 ===== */
  "札幌市営地下鉄南北線": "#008B44",
  "札幌市営地下鉄東西線": "#F15A22",
  "札幌市営地下鉄東豊線": "#0072C6",

  /* ===== 福岡 ===== */
  "福岡市地下鉄空港線": "#F6AA00",
  "福岡市地下鉄箱崎線": "#00A0DF",
  "福岡市地下鉄七隈線": "#00A650"
};

const getLineColor = (name: string): string => {
  if (LINE_COLORS[name]) return LINE_COLORS[name];
  const key = Object.keys(LINE_COLORS).find(k => name.includes(k));
  if (key) return LINE_COLORS[key];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
};

// --- 駅ナンバリング辞書 (主要路線) ---
const STATION_NUMBERING: { [lineName: string]: { [stationName: string]: string } } = {
  "JR山手線": {
    "東京": "JY-01", "神田": "JY-02", "秋葉原": "JY-03", "御徒町": "JY-04", "上野": "JY-05",
    "鶯谷": "JY-06", "日暮里": "JY-07", "西日暮里": "JY-08", "田端": "JY-09", "駒込": "JY-10",
    "巣鴨": "JY-11", "大塚": "JY-12", "池袋": "JY-13", "目白": "JY-14", "高田馬場": "JY-15",
    "新大久保": "JY-16", "新宿": "JY-17", "代々木": "JY-18", "原宿": "JY-19", "渋谷": "JY-20",
    "恵比寿": "JY-21", "目黒": "JY-22", "五反田": "JY-23", "大崎": "JY-24", "品川": "JY-25",
    "田町": "JY-26", "浜松町": "JY-27", "新橋": "JY-28", "有楽町": "JY-29", "東京1": "JY-30"
  },
  "JR中央線快速": {
    "東京": "JC-01", "神田": "JC-02", "御茶ノ水": "JC-03", "四ツ谷": "JC-04", "新宿": "JC-05",
    "中野": "JC-06", "高円寺": "JC-07", "阿佐ケ谷": "JC-08", "荻窪": "JC-09", "西荻窪": "JC-10",
    "吉祥寺": "JC-11", "三鷹": "JC-12", "武蔵境": "JC-13", "東小金井": "JC-14", "武蔵小金井": "JC-15",
    "国分寺": "JC-16", "西国分寺": "JC-17", "国立": "JC-18", "立川": "JC-19", "日野": "JC-20",
    "豊田": "JC-21", "八王子": "JC-22", "西八王子": "JC-23", "高尾": "JC-24"
  },
  "東京メトロ銀座線": {
    "渋谷": "G-01", "表参道": "G-02", "外苑前": "G-03", "青山一丁目": "G-04", "赤坂見附": "G-05",
    "溜池山王": "G-06", "虎ノ門": "G-07", "新橋": "G-08", "銀座": "G-09", "京橋": "G-10",
    "日本橋": "G-11", "三越前": "G-12", "神田": "G-13", "末広町": "G-14", "上野広小路": "G-15",
    "上野": "G-16", "稲荷町": "G-17", "田原町": "G-18", "浅草": "G-19"
  },
  "東京メトロ丸ノ内線": {
    "池袋": "M-25", "新大塚": "M-24", "茗荷谷": "M-23", "後楽園": "M-22", "本郷三丁目": "M-21",
    "御茶ノ水": "M-20", "淡路町": "M-19", "大手町": "M-18", "東京": "M-17", "銀座": "M-16",
    "霞ケ関": "M-15", "国会議事堂前": "M-14", "赤坂見附": "M-13", "四ツ谷": "M-12", "四谷三丁目": "M-11",
    "新宿御苑前": "M-10", "新宿三丁目": "M-09", "新宿": "M-08", "西新宿": "M-07", "中野坂上": "M-06",
    "新中野": "M-05", "東高円寺": "M-04", "新高円寺": "M-03", "南阿佐ケ谷": "M-02", "荻窪": "M-01"
  },
  "大阪メトロ御堂筋線": {
    "江坂": "M-11", "東三国": "M-12", "新大阪": "M-13", "西中島南方": "M-14", "中津": "M-15",
    "梅田": "M-16", "淀屋橋": "M-17", "本町": "M-18", "心斎橋": "M-19", "なんば": "M-20",
    "大国町": "M-21", "動物園前": "M-22", "天王寺": "M-23", "昭和町": "M-24", "西田辺": "M-25",
    "長居": "M-26", "我孫子": "M-27", "北花田": "M-28", "新金岡": "M-29", "なかもず": "M-30"
  }
};

const getStationNumber = (lineName: string | undefined, stationName: string): string | null => {
  if (!lineName || !STATION_NUMBERING[lineName]) return null;
  return STATION_NUMBERING[lineName][stationName] || null;
};

// --- 距離計算 ---
const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = CONFIG.EARTH_RADIUS; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export default function App() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  
  const [savedLines, setSavedLines] = useState<TrainLine[]>([]);
  const [selectedLine, setSelectedLine] = useState<TrainLine | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  
  const [isTracking, setIsTracking] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [isArrived, setIsArrived] = useState(false);
  const [currentStationIndex, setCurrentStationIndex] = useState<number>(-1);
  const [nearestStationDistance, setNearestStationDistance] = useState<number | null>(null);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const hasNotificationPermission = useRef<boolean>(false);
  const isHeadphonesConnected = useRef<boolean>(false);
  const hasNotified = useRef<boolean>(false);
  const lastNotificationTime = useRef<number>(0);
  const extraVibrationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  
  // モーダル関連State
  const [modalVisible, setModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [inputLineName, setInputLineName] = useState("");
  const [isLoadingAPI, setIsLoadingAPI] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  
  // ★追加: 駅名検索用のState
  const [foundLines, setFoundLines] = useState<string[]>([]); 

    const triggerVibration = useCallback(async () => {
      if (!settings.vibrationEnabled) return;

      if (Platform.OS === 'ios') {
        // iOSは短い間隔で強いハプティクスを固め打ち
        const pulses = [
          () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
          () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
          () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
          () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
          () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
        ];
        for (const pulse of pulses) {
          await pulse();
          await new Promise(resolve => setTimeout(resolve, 90));
        }
      } else {
        // Androidはより長いパターンで強調
        Vibration.vibrate(VIBRATION_PATTERN_STRONG);
      }
    }, [settings.vibrationEnabled]);

  useEffect(() => { 
    loadLines(); 
    loadSettings(); 
    requestPermissions();
    isHeadphonesConnected.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 通知受信時に確実にハプティクスを鳴らす（フォアグラウンドでも発火）
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      if (Platform.OS === 'android') return; // Androidは通知自体がバイブするので二重振動を防ぐ
      triggerVibration();
    });
    return () => subscription.remove();
  }, [triggerVibration]);
  
  const requestPermissions = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('権限エラー', '位置情報の使用を許可してください');
        return;
      }
      const notificationResult = await Notifications.requestPermissionsAsync();
      hasNotificationPermission.current = notificationResult.status === 'granted';

      // Androidはチャンネル単位でバイブ・音の可否が決まるため事前に作成する
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: 'Train Alarm',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: VIBRATION_PATTERN_STRONG,
          enableVibrate: true,
          sound: 'default',
        });
      }
    } catch (e) {
      console.warn("Permission Error:", e);
    }
  };

  const saveLines = async (lines: TrainLine[]) => {
    try { 
      await AsyncStorage.setItem('SavedTrainLines', JSON.stringify(lines)); 
      setSavedLines(lines); 
    } catch (e) { 
      console.error(e);
      Alert.alert('保存エラー', '路線データの保存に失敗しました');
    }
  };

  const loadLines = useCallback(async () => {
    try { 
      const jsonValue = await AsyncStorage.getItem('SavedTrainLines'); 
      if (jsonValue != null) setSavedLines(JSON.parse(jsonValue)); 
    } catch (e) { 
      console.error(e);
      Alert.alert('読み込みエラー', '路線データの読み込みに失敗しました');
    }
  }, []);

  const saveSettings = async (newSettings: AppSettings) => {
    try { 
      await AsyncStorage.setItem('AppSettings', JSON.stringify(newSettings)); 
      setSettings(newSettings); 
    } catch (e) { 
      console.error(e);
      Alert.alert('保存エラー', '設定の保存に失敗しました');
    }
  };

  const loadSettings = useCallback(async () => {
    try { 
      const jsonValue = await AsyncStorage.getItem('AppSettings'); 
      if (jsonValue != null) setSettings(JSON.parse(jsonValue)); 
    } catch (e) { 
      console.error(e);
      Alert.alert('読み込みエラー', '設定の読み込みに失敗しました');
    }
  }, []);

  const deleteLine = (lineId: string) => {
    Alert.alert("削除の確認", "この路線データを削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      { 
        text: "削除", 
        style: "destructive", 
        onPress: () => {
          const newLines = savedLines.filter(line => line.id !== lineId);
          saveLines(newLines);
          if (selectedLine?.id === lineId) {
            setSelectedLine(null);
            setSelectedStation(null);
          }
        }
      }
    ]);
  };

  // --- ★追加: 駅名から路線を検索する機能 ---
  const searchLinesFromStation = async () => {
    if (!inputLineName) return;
    Keyboard.dismiss(); 
    setIsLoadingAPI(true);
    setFoundLines([]); // リセット

    try {
      // API: 駅名から路線一覧を取得
      const response = await fetch(`https://express.heartrails.com/api/json?method=getStations&name=${encodeURIComponent(inputLineName)}`);
      const json: HeartRailsResponse = await response.json();
      
      if (!json.response || !json.response.station) {
        Alert.alert("見つかりません", "その駅名を通る路線は見つかりませんでした。");
      } else {
        // 路線リストを表示
        const uniqueLines = Array.from(new Set(json.response.station.map(s => s.line).filter((line): line is string => !!line)));
        setFoundLines(uniqueLines);
      }
    } catch (error: any) {
      Alert.alert("通信エラー", error.message);
    } finally {
      setIsLoadingAPI(false);
    }
  };

  // --- 路線データのダウンロード (引数で路線名を指定できるように変更) ---
  const downloadLine = async (targetLineName: string) => {
    // 引数がない場合は入力フォームの値を使う
    const lineToDownload = targetLineName || inputLineName;
    if (!lineToDownload) return;

    Keyboard.dismiss(); 
    setIsLoadingAPI(true);
    
    try {
      const response = await fetch(`https://express.heartrails.com/api/json?method=getStations&line=${encodeURIComponent(lineToDownload)}`);
      const json: HeartRailsResponse = await response.json();
      
      if (!json.response || !json.response.station) {
        Alert.alert("エラー", "駅情報が見つかりませんでした。"); 
        setIsLoadingAPI(false); 
        return;
      }
      
      const stations: Station[] = json.response.station.map((s: HeartRailsStation) => ({
        id: `${s.name}_${s.y}_${s.x}`, 
        name: s.name, 
        latitude: parseFloat(s.y), 
        longitude: parseFloat(s.x)
      }));
      
      const color = getLineColor(lineToDownload);
      const newLine: TrainLine = { 
        id: Date.now().toString(), 
        name: lineToDownload, 
        stations: stations, 
        color: color 
      };

      if (savedLines.some(l => l.name === newLine.name)) { 
        Alert.alert("確認", `${lineToDownload} は既に保存済みです`); 
      } else { 
        const newLines = [...savedLines, newLine]; 
        saveLines(newLines); 
        
        // 成功時のリセット
        setInputLineName(""); 
        setFoundLines([]);
        setModalVisible(false); 
        Alert.alert("成功", `${lineToDownload}を追加しました`); 
      }
    } catch (error: unknown) { 
      const message = error instanceof Error ? error.message : '不明なエラー';
      Alert.alert("通信エラー", message); 
    } finally { 
      setIsLoadingAPI(false); 
    }
  };

  const startTracking = async () => {
    if (!selectedStation) return;
    setIsTracking(true); setIsArrived(false); hasNotified.current = false;
    extraVibrationTimers.current.forEach(clearTimeout);
    extraVibrationTimers.current = [];
    
    try {
      locationSubscription.current = await Location.watchPositionAsync(
        { 
          accuracy: Location.Accuracy.High, 
          timeInterval: CONFIG.GPS_INTERVAL_MS, 
          distanceInterval: CONFIG.GPS_DISTANCE_FILTER 
        },
        (loc) => updateLocation(loc.coords)
      );
    } catch {
      Alert.alert("エラー", "位置情報の取得を開始できませんでした");
    }
  };

  const stopTracking = async () => {
    if (locationSubscription.current) locationSubscription.current.remove();
    await Notifications.cancelAllScheduledNotificationsAsync();
    extraVibrationTimers.current.forEach(clearTimeout);
    extraVibrationTimers.current = [];
    hasNotified.current = false;
    setIsTracking(false); setDistance(null); setIsArrived(false); setCurrentStationIndex(-1);
  };

  const sendNotification = useCallback(async () => {
    if (!hasNotificationPermission.current || hasNotified.current) return;

    const now = Date.now();
    if (now - lastNotificationTime.current < NOTIFICATION_COOLDOWN_MS) return; // 直近送信からのクールダウン
    lastNotificationTime.current = now;
    hasNotified.current = true; // 最初にセットして多重発火を防ぐ
    try {
      // 予約済みの通知を一旦すべてクリアしてから新規予約
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.dismissAllNotificationsAsync(); // 既に表示済みのものも消す

      let shouldPlaySound = true;
      if (settings.soundOnlyWithHeadphones) {
        shouldPlaySound = isHeadphonesConnected.current;
      }

      const soundSetting = shouldPlaySound ? 'default' : undefined;
      const contentInput = {
        title: "まもなく到着",
        body: `${selectedStation?.name}付近です`,
        sound: soundSetting,
        vibrate: Platform.OS === 'android' && settings.vibrationEnabled ? VIBRATION_PATTERN_STRONG : undefined,
      };

      const repeatDelaySeconds = NOTIFICATION_REPEAT_INTERVAL_SECONDS + Math.ceil(NOTIFICATION_PATTERN_DURATION_MS / 1000);

      // 1回目：即時
      await Notifications.scheduleNotificationAsync({
        content: contentInput,
        trigger: null,
      });

      // 2回目以降：OSに予約
      for (let i = 1; i < NOTIFICATION_REPEAT_COUNT; i++) {
        const delaySeconds = i * repeatDelaySeconds;
        await Notifications.scheduleNotificationAsync({
          content: contentInput,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
            channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
          },
        });
      }

      // 通知は1件だが、端末側で複数回振動させる
      if (settings.vibrationEnabled) {
        extraVibrationTimers.current.forEach(clearTimeout);
        extraVibrationTimers.current = [];
        for (let i = 0; i < EXTRA_VIBRATION_ROUNDS; i++) {
          const delay = (NOTIFICATION_PATTERN_DURATION_MS + EXTRA_VIBRATION_GAP_MS) * (i + 1);
          const t = setTimeout(() => {
            triggerVibration();
          }, delay);
          extraVibrationTimers.current.push(t);
        }
      }
    } catch (e) {
      console.warn("Notification Error:", e);
      hasNotified.current = false;
    }
  }, [selectedStation, settings, triggerVibration]);

  const updateLocation = useCallback((coords: { latitude: number; longitude: number }) => {
    if (!selectedStation || !selectedLine) return;
    if (!coords.latitude || !coords.longitude) return; 
    
    const arrivalThreshold = settings.arrivalThreshold ?? CONFIG.ARRIVAL_THRESHOLD;
    const justArrivedThreshold = CONFIG.CURRENT_STATION_THRESHOLD;
    const departThreshold = Math.max(arrivalThreshold + 150, CONFIG.DEPARTURE_THRESHOLD);

    const dist = getDistanceFromLatLonInMeters(coords.latitude, coords.longitude, selectedStation.latitude, selectedStation.longitude);
    setDistance(Math.floor(dist));
    
    if (dist <= justArrivedThreshold && !isArrived) { 
      setIsArrived(true); 
      sendNotification(); 
    } else if (dist <= arrivalThreshold) {
      setIsArrived(true);
    } else if (dist > departThreshold) { 
      setIsArrived(false); 
    }

    const stations = selectedLine.stations;
    let startIdx = 0;
    let endIdx = stations.length;
    
    if (currentStationIndex >= 0 && stations.length > 30) {
      const searchRange = 15;
      startIdx = Math.max(0, currentStationIndex - searchRange);
      endIdx = Math.min(stations.length, currentStationIndex + searchRange);
    }
    
    let minD = 99999999;
    let nearestIdx = currentStationIndex >= 0 ? currentStationIndex : 0;
    for (let i = startIdx; i < endIdx; i++) {
      const s = stations[i];
      const d = getDistanceFromLatLonInMeters(coords.latitude, coords.longitude, s.latitude, s.longitude);
      if (d < minD) { minD = d; nearestIdx = i; }
    }

    setNearestStationDistance(Math.floor(minD));
    
    if (nearestIdx !== currentStationIndex) {
      setCurrentStationIndex(nearestIdx);
    }
  }, [selectedStation, selectedLine, currentStationIndex, isArrived, sendNotification, settings.arrivalThreshold]);

  // モーダル閉じる時のリセット
  const closeModal = () => {
    setModalVisible(false);
    setFoundLines([]); // 検索結果をクリア
    setInputLineName("");
  };

  if (isTracking) {
    const isJustArrived = distance !== null && distance <= CONFIG.CURRENT_STATION_THRESHOLD;
    
    const simulateDistance = (testDistance: number) => {
      setDistance(testDistance);
      hasNotified.current = false; // フラグをリセット
      
      // 距離に応じてisArrivedを正しく設定
      if (testDistance <= CONFIG.DEPARTURE_THRESHOLD) {
        // 150m～600m: 到着状態（「ただいま」または「まもなく」）
        setIsArrived(true);
        sendNotification();
      } else {
        // 600m以上: 非到着状態（「次は」）
        setIsArrived(false);
      }
    };
    
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={[styles.lcdWrapper, { shadowColor: theme.text }]}>
            <TrainLCD 
              targetStation={selectedStation!} 
              distance={distance !== null ? distance : 9999}
              isArrived={isArrived}
              lineName={selectedLine?.name}
              lineColor={selectedLine?.color}
              stations={selectedLine?.stations || []}
              currentStationIndex={currentStationIndex}
              nearestStationDistance={nearestStationDistance}
              theme={theme}
            />
          </View>
          
          <View style={[styles.debugPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.debugRow}>
              <Text style={[styles.debugLabel, { color: theme.subText }]}>距離:</Text>
              <Text style={[styles.debugValue, { color: theme.text }]}>{distance !== null ? `${distance}m` : '計測中...'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={[styles.debugLabel, { color: theme.subText }]}>状態:</Text>
              <Text style={[styles.debugValue, { color: isJustArrived ? '#ff3b30' : (isArrived ? '#ff9500' : theme.text), fontWeight: 'bold' }]}>
                {isJustArrived ? '到着 🔴' : (isArrived ? 'まもなく 🟠' : '進行中')}
              </Text>
            </View>
            
            <Text style={[styles.debugLabel, { color: theme.subText, marginTop: 10 }]}>距離シミュレート:</Text>
            <View style={styles.simulateButtonsContainer}>
              <TouchableOpacity style={[styles.simulateButton, { backgroundColor: '#34C759' }]} onPress={() => simulateDistance(0)}>
                <Text style={styles.simulateButtonText}>0m</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.simulateButton, { backgroundColor: '#FF3B30' }]} onPress={() => simulateDistance(100)}>
                <Text style={styles.simulateButtonText}>100m</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.simulateButton, { backgroundColor: '#FF9500' }]} onPress={() => simulateDistance(200)}>
                <Text style={styles.simulateButtonText}>200m</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.simulateButton, { backgroundColor: '#007AFF' }]} onPress={() => simulateDistance(500)}>
                <Text style={styles.simulateButtonText}>500m</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.simulateButton, { backgroundColor: '#8e8e93' }]} onPress={() => simulateDistance(800)}>
                <Text style={styles.simulateButtonText}>800m</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <TouchableOpacity style={[styles.debugButtonVibration]} onPress={triggerVibration}>
            <Text style={styles.debugButtonText}>🔔 バイブテスト</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.stopButton, {backgroundColor: isArrived ? '#333' : '#d1d1d6', marginTop: 20}]} onPress={stopTracking}>
            <Text style={[styles.buttonText, {color: isArrived ? '#fff' : '#000'}]}>アラーム停止・終了</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: theme.card }]}>
        <TouchableOpacity onPress={() => setSettingsModalVisible(true)}>
          <Text style={[styles.addText, {fontSize: 28, letterSpacing: 2}]}>⋯</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>寝過ごし防止</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)}><Text style={styles.addText}>＋追加</Text></TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>① 路線を選択</Text>
        {savedLines.length === 0 ? <Text style={[styles.emptyText, { color: theme.subText }]}>右上の「＋追加」から{"\n"}路線データを追加してください</Text> : (
          <FlatList horizontal data={savedLines} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View>
                <TouchableOpacity
                  style={[styles.lineCard, { backgroundColor: theme.border }, selectedLine?.id === item.id && styles.selectedCard]} 
                  onPress={() => { setSelectedLine(item); setSelectedStation(null); }}
                >
                  <Text style={[styles.cardText, { color: theme.text }, selectedLine?.id === item.id && styles.selectedCardText]} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBadge} onPress={() => deleteLine(item.id)}>
                   <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
      <View style={[styles.section, { flex: 1, backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>② 着駅を選択</Text>
        {selectedLine ? (
          <FlatList data={selectedLine.stations} keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.stationRow, { borderBottomColor: theme.border }]} onPress={() => setSelectedStation(item)}>
                <Text style={[styles.stationName, { color: theme.text }]}>{item.name}</Text>
                {selectedStation?.id === item.id && <Text style={styles.checkMark}>✔︎</Text>}
              </TouchableOpacity>
            )}
          />
        ) : ( <View style={styles.centerBox}><Text style={[styles.grayText, { color: theme.subText }]}>路線を選ぶと駅が表示されます</Text></View> )}
      </View>
      <View style={[styles.footer, { backgroundColor: theme.card }]}>
        <TouchableOpacity style={[styles.startButton, !selectedStation && styles.disabledButton]} disabled={!selectedStation} onPress={startTracking}>
          <Text style={styles.startButtonText}>アラーム開始</Text>
        </TouchableOpacity>
      </View>

      {/* 路線追加モーダル（UI更新） */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: theme.modalBg }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>路線データの追加</Text>
          <Text style={[styles.modalDesc, { color: theme.subText }]}>路線名、または駅名を入力してください{"\n"}(例: JR山手線 / 新宿)</Text>
          
          <TextInput 
            style={[styles.input, { borderColor: theme.border, color: theme.text }]} 
            placeholder="入力してください" 
            placeholderTextColor={theme.subText}
            value={inputLineName} 
            onChangeText={setInputLineName} 
          />

          {isLoadingAPI ? (
            <ActivityIndicator size="large" color="#007AFF" />
          ) : (
            <>
              {/* 駅名検索結果のリスト表示エリア */}
              {foundLines.length > 0 ? (
                <View style={{ flex: 1, width: '100%', marginBottom: 10 }}>
                  <Text style={{color: theme.subText, marginBottom: 5}}>「{inputLineName}」を通る路線が見つかりました</Text>
                  <FlatList 
                    data={foundLines}
                    keyExtractor={(item) => item}
                    renderItem={({item}) => (
                      <TouchableOpacity 
                        style={[styles.searchResultItem, { borderBottomColor: theme.border }]}
                        onPress={() => downloadLine(item)}
                      >
                        <Text style={{color: theme.text, fontSize: 16}}>{item}</Text>
                        <Text style={{color: '#007AFF'}}>追加</Text>
                      </TouchableOpacity>
                    )}
                  />
                  <TouchableOpacity style={styles.backButton} onPress={() => setFoundLines([])}>
                    <Text style={{color: theme.subText}}>検索に戻る</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ width: '100%' }}>
                  {/* 通常のダウンロードボタン */}
                  <TouchableOpacity 
                    style={[styles.downloadButton, {backgroundColor: '#007AFF', marginBottom: 10}]} 
                    onPress={() => downloadLine(inputLineName)}
                  >
                    <Text style={styles.buttonText}>路線名として追加</Text>
                  </TouchableOpacity>
                  
                  {/* ★駅名検索ボタン */}
                  <TouchableOpacity 
                    style={[styles.downloadButton, {backgroundColor: '#34C759'}]} 
                    onPress={searchLinesFromStation}
                  >
                    <Text style={styles.buttonText}>駅名から路線を検索</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
          
          <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
            <Text style={styles.closeText}>閉じる</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 設定モーダル */}
      <Modal visible={settingsModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: theme.modalBg }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>設定</Text>
          
          <View style={styles.settingRow}>
            <View style={{flex: 1}}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>イヤホン時のみ音を鳴らす</Text>
              <Text style={[styles.settingDesc, { color: theme.subText }]}>電車内での使用に推奨</Text>
            </View>
            <TouchableOpacity 
              style={[styles.toggleButton, settings.soundOnlyWithHeadphones && styles.toggleButtonActive]}
              onPress={() => saveSettings({...settings, soundOnlyWithHeadphones: !settings.soundOnlyWithHeadphones})}
            >
              <Text style={styles.toggleText}>{settings.soundOnlyWithHeadphones ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingRow}>
            <View style={{flex: 1}}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>バイブレーション</Text>
              <Text style={[styles.settingDesc, { color: theme.subText }]}>振動で通知</Text>
            </View>
            <TouchableOpacity 
              style={[styles.toggleButton, settings.vibrationEnabled && styles.toggleButtonActive]}
              onPress={() => saveSettings({...settings, vibrationEnabled: !settings.vibrationEnabled})}
            >
              <Text style={styles.toggleText}>{settings.vibrationEnabled ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingRow}>
            <View style={{flex: 1}}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>到着通知距離</Text>
              <Text style={[styles.settingDesc, { color: theme.subText }]}>現在: {settings.arrivalThreshold}m</Text>
            </View>
          </View>
          <View style={styles.sliderContainer}>
            <TouchableOpacity style={styles.distanceButton} onPress={() => saveSettings({...settings, arrivalThreshold: 300})}>
              <Text style={[styles.distanceButtonText, settings.arrivalThreshold === 300 && {color: '#007AFF', fontWeight: 'bold'}]}>300m</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.distanceButton} onPress={() => saveSettings({...settings, arrivalThreshold: 500})}>
              <Text style={[styles.distanceButtonText, settings.arrivalThreshold === 500 && {color: '#007AFF', fontWeight: 'bold'}]}>500m</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.distanceButton} onPress={() => saveSettings({...settings, arrivalThreshold: 800})}>
              <Text style={[styles.distanceButtonText, settings.arrivalThreshold === 800 && {color: '#007AFF', fontWeight: 'bold'}]}>800m</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.distanceButton} onPress={() => saveSettings({...settings, arrivalThreshold: 1000})}>
              <Text style={[styles.distanceButtonText, settings.arrivalThreshold === 1000 && {color: '#007AFF', fontWeight: 'bold'}]}>1000m</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={() => setSettingsModalVisible(false)}>
            <Text style={styles.closeText}>閉じる</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- LCDコンポーネント (ズレ完全修正版 & Type Safe) ---
interface LCDProps {
  targetStation: Station;
  distance: number;
  isArrived: boolean;
  lineName?: string;
  lineColor?: string;
  stations: Station[];
  currentStationIndex: number;
  nearestStationDistance: number | null;
  theme: ThemeColors;
}

function TrainLCD({ targetStation, distance, isArrived, lineName, lineColor, stations, currentStationIndex, nearestStationDistance, theme }: LCDProps) {
  const themeColor = lineColor || '#007AFF';
  
  const targetIdx = stations.findIndex(s => s.id === targetStation.id);
  const isReverse = currentStationIndex > targetIdx;
  let nextIdx = isReverse ? currentStationIndex - 1 : currentStationIndex + 1;
  
  if (nextIdx < 0) nextIdx = 0;
  if (nextIdx >= stations.length) nextIdx = stations.length - 1;
  if ((!isReverse && nextIdx > targetIdx) || (isReverse && nextIdx < targetIdx)) { nextIdx = targetIdx; }
  
  const nextStation = (stations.length > 0 && nextIdx >= 0) ? stations[nextIdx] : targetStation;

  const isJustArrived = distance <= CONFIG.CURRENT_STATION_THRESHOLD;
  const isOneBeforeTarget = targetIdx >= 0 && currentStationIndex >= 0 && (
    (!isReverse && currentStationIndex === targetIdx - 1) ||
    (isReverse && currentStationIndex === targetIdx + 1)
  );
  const isBetweenStations = nearestStationDistance !== null && nearestStationDistance > CONFIG.CURRENT_STATION_THRESHOLD;
  
  let headerTextJa = "次は";
  let headerTextEn = "Next";
  let labelColor = theme.lcdSubText;
  
  if (isJustArrived) {
    headerTextJa = "ただいま";
    headerTextEn = "Current Station";
    labelColor = '#ff3b30';
  } else if (isArrived || isOneBeforeTarget) {
    headerTextJa = "まもなく";
    headerTextEn = "Arriving at";
    labelColor = '#ff3b30';
  }

  const targetNumber = getStationNumber(lineName, targetStation.name);
  const nextNumber = getStationNumber(lineName, nextStation.name);
  const displayTargetStr = targetNumber ? `${targetStation.name} (${targetNumber})` : targetStation.name;
  const displayNumberStr = (isArrived || isJustArrived || isOneBeforeTarget)
    ? (targetNumber ? `(${targetNumber})` : "") 
    : (nextNumber ? `(${nextNumber})` : "");
  
  let stationAfterArrived: Station | null = null;
  if (isArrived || isJustArrived) {
    let afterIdx = isReverse ? targetIdx - 1 : targetIdx + 1;
    if (afterIdx >= 0 && afterIdx < stations.length) {
      stationAfterArrived = stations[afterIdx];
    }
  }

  const startIdx = isReverse ? currentStationIndex + 1 : currentStationIndex - 1;
  const count = Math.min(CONFIG.LCD_DISPLAY_COUNT, stations.length);
  const displayStations: (DisplayStation | null)[] = [];
  
  for(let i = 0; i < count; i++) {
    const idx = isReverse ? startIdx - i : startIdx + i;
    if (idx >= 0 && idx < stations.length) {
      const s = stations[idx];
      let status: 'passed' | 'current' | 'future' = 'future'; 
      if (idx === currentStationIndex) status = 'current'; 
      if (isReverse) { if (idx > currentStationIndex) status = 'passed'; } 
      else { if (idx < currentStationIndex) status = 'passed'; }
      displayStations.push({ ...s, status });
    } else {
      displayStations.push(null);
    }
  }

  const mainStationName = (isArrived || isJustArrived) ? targetStation.name : nextStation.name;

  return (
    <View style={[styles.lcdContainer, { backgroundColor: theme.lcdBg, borderColor: theme.lcdBorder }]}>
      <View style={[styles.lcdHeader, { backgroundColor: themeColor }]}>
        <Text style={styles.lcdLineName}>{lineName || "Train Line"}</Text>
      </View>

      <View style={[styles.lcdBody, { backgroundColor: theme.lcdBg }]}>
        <View style={styles.absoluteLabelContainer}>
          <Text style={[styles.lcdNextLabel, { color: labelColor }]}>{headerTextJa}</Text>
          <Text style={[styles.lcdNextLabelEn, { color: labelColor }]}>{headerTextEn}</Text>
        </View>
        <Text style={[styles.lcdStationName, { color: theme.lcdText }]} numberOfLines={1} adjustsFontSizeToFit>
          {mainStationName}
        </Text>
        <View style={{flexDirection:'row', alignItems:'baseline'}}>
          <Text style={[styles.lcdStationNameSub, { color: theme.lcdSubText }]}>
            {(isArrived || isJustArrived) ? targetStation.name : nextStation.name} Station
          </Text>
          {displayNumberStr ? (
            <Text style={[styles.lcdStationNameSub, { color: theme.lcdSubText, marginLeft: 8, fontWeight:'bold' }]}>
                {displayNumberStr}
            </Text>
          ) : null}
        </View>
        
        {(isArrived || isJustArrived) && stationAfterArrived && (
          <View style={styles.nextStationPreview}>
            <Text style={[styles.nextStationPreviewLabel, { color: theme.lcdSubText }]}>Next</Text>
            <Text style={[styles.nextStationPreviewName, { color: theme.lcdText }]}>{stationAfterArrived.name}</Text>
          </View>
        )}
      </View>

      <View style={[styles.lcdRouteContainer, { backgroundColor: theme.lcdBg, borderTopColor: theme.lcdBorder }]}>
        <View style={[styles.baseLine, { backgroundColor: theme.border }]} />
        <View style={styles.stationsRow}>
          {displayStations.map((station, index) => {
            if (!station) return <View key={index} style={styles.stationNode} />;
            
            let nodeColor = theme.border; 
            let textColor = theme.lcdSubText;
            let isCurrent = station.status === 'current';
            let isTarget = station.id === targetStation.id;
            
            if (isCurrent) {
              nodeColor = (isArrived || isJustArrived) ? '#ff3b30' : themeColor;
              textColor = theme.lcdText;
            } else if (station.status === 'future') {
              nodeColor = themeColor;
              textColor = theme.lcdSubText;
            }

            if (isTarget && !isCurrent) {
              nodeColor = '#ff3b30';
              textColor = '#ff3b30';
            }

            return (
              <View key={index} style={styles.stationNode}>
                {index < count - 1 && station.status !== 'passed' && displayStations[index+1]?.status !== 'passed' && (
                  <View style={[styles.activeLine, { backgroundColor: themeColor }]} />
                )}
                <View style={styles.dotContainer}>
                  <View style={[
                    styles.dot, 
                    { backgroundColor: nodeColor },
                    isCurrent && styles.currentDot,
                    isTarget && !isCurrent && styles.targetDot
                  ]} />
                </View>
                <Text style={[
                  styles.nodeText, 
                  { color: textColor }, 
                  isCurrent && { fontWeight: 'bold', color: theme.lcdText },
                  isTarget && !isCurrent && { fontWeight: 'bold', color: '#ff3b30' }
                ]} numberOfLines={1}>
                  {station.name}
                </Text>
              </View>
            );
          })}
        </View>

        {isBetweenStations && (
          <View style={styles.pointerLayer} pointerEvents="none">
            {(() => {
              const currentIdxOnDisplay = displayStations.findIndex(s => s?.status === 'current');
              const effectiveIdx = currentIdxOnDisplay >= 0 ? currentIdxOnDisplay : Math.floor(count / 2);
              const baseRatio = count > 1 ? (effectiveIdx + 0.5) / count : 0.5;
              const offset = isReverse ? -0.08 : 0.08;
              const ratio = Math.min(1, Math.max(0, baseRatio + offset));
              return (
                <View style={[styles.pointerArrow, { left: `${ratio * 100}%`, transform: [{ translateX: -6 }, { rotate: isReverse ? '180deg' : '0deg' }] }]} />
              );
            })()}
          </View>
        )}
      </View>
      
      <View style={[styles.lcdDistanceBox, { backgroundColor: '#1c1c1e' }]}>
        <Text style={styles.lcdDistanceLabel}>{displayTargetStr} まで およそ</Text>
        <Text style={styles.lcdDistanceValue}>{isJustArrived ? "到着" : ((isArrived || isOneBeforeTarget) ? "まもなく" : `${distance} m`)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  addText: { fontSize: 18, color: '#007AFF' },
  clearText: { fontSize: 16, color: 'red' },
  section: { padding: 16, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  emptyText: { textAlign: 'center', marginTop: 20 },
  
  lineCard: { padding: 15, borderRadius: 10, marginRight: 10, minWidth: 120, maxWidth: 180 },
  selectedCard: { backgroundColor: '#007AFF' },
  cardText: { fontWeight: 'bold' },
  selectedCardText: { color: '#fff' },
  deleteBadge: { position: 'absolute', right: 5, top: -5, backgroundColor: '#ccc', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 1, borderColor: '#fff' },
  deleteText: { color: 'white', fontWeight: 'bold', fontSize: 12 },

  stationRow: { flexDirection: 'row', paddingVertical: 15, borderBottomWidth: 1 },
  stationName: { fontSize: 16 },
  checkMark: { marginLeft: 'auto', color: '#007AFF', fontWeight: 'bold' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grayText: { },
  footer: { padding: 16 },
  startButton: { backgroundColor: '#007AFF', padding: 16, borderRadius: 15, alignItems: 'center' },
  disabledButton: { backgroundColor: '#ccc' },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  modalContainer: { flex: 1, padding: 20, paddingTop: 50 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  modalDesc: { textAlign: 'center', marginBottom: 20 },
  input: { borderWidth: 1, borderRadius: 8, padding: 15, marginBottom: 20 },
  downloadButton: { padding: 15, borderRadius: 10, alignItems: 'center', width: '100%' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  closeButton: { marginTop: 20, alignItems: 'center' },
  closeText: { color: '#007AFF', fontSize: 16 },
  
  // 検索結果用
  searchResultItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, width: '100%' },
  backButton: { marginTop: 10, alignItems: 'center', padding: 10 },

  // 設定画面用
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#e5e5ea' },
  settingLabel: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  settingDesc: { fontSize: 13 },
  toggleButton: { backgroundColor: '#ccc', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  toggleButtonActive: { backgroundColor: '#34C759' },
  toggleText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  sliderContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10, paddingHorizontal: 10 },
  distanceButton: { padding: 12, borderRadius: 8, backgroundColor: '#f2f2f7', minWidth: 70, alignItems: 'center' },
  distanceButtonText: { fontSize: 14, color: '#000' },

  stopButton: { paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, alignSelf:'center' },
  debugPanel: { borderWidth: 1, borderRadius: 10, padding: 12, marginHorizontal: 20, marginVertical: 15 },
  debugRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  debugLabel: { fontSize: 13, fontWeight: '500' },
  debugValue: { fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  simulateButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8, gap: 6 },
  simulateButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', flex: 1 },
  simulateButtonText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  debugButtonVibration: { paddingHorizontal: 20, paddingVertical: 10, marginHorizontal: 20, marginVertical: 10, borderRadius: 8, backgroundColor: '#FF9500', alignItems: 'center' },
  debugButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  lcdWrapper: { width: '95%', alignSelf: 'center', marginTop: 20, marginBottom: 20, elevation: 5, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  lcdContainer: { borderRadius: 10, overflow: 'hidden', borderWidth: 1 },
  lcdHeader: { padding: 12, paddingHorizontal: 20, justifyContent:'center' },
  lcdLineName: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  lcdBody: { padding: 20, alignItems: 'center', height: 160, justifyContent: 'center', position: 'relative' },
  absoluteLabelContainer: { position: 'absolute', top: 15, left: 20 },
  lcdNextLabel: { fontSize: 18, fontWeight: 'bold' },
  lcdNextLabelEn: { fontSize: 14, marginTop: 2 },
  
  lcdStationName: { fontSize: 42, fontWeight: 'bold', letterSpacing: 1, marginBottom: 5, textAlign: 'center', width: '90%', flexShrink: 1 },
  lcdStationNameSub: { fontSize: 18, marginTop: 0, fontFamily: 'System' },
  
  nextStationPreview: { position: 'absolute', bottom: 10, right: 20, alignItems: 'flex-end' },
  nextStationPreviewLabel: { fontSize: 12, marginBottom: 0 },
  nextStationPreviewName: { fontSize: 18, fontWeight: 'bold' },

  lcdRouteContainer: { height: 120, position: 'relative', justifyContent: 'flex-start', borderTopWidth: 1, paddingTop: 20 },
  baseLine: { position: 'absolute', top: 48, left: 20, right: 20, height: 4, zIndex: 0 },
  stationsRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 10 },
  stationNode: { flex: 1, alignItems: 'center', position: 'relative' },
  activeLine: { position: 'absolute', top: 28, left: '50%', width: '100%', height: 4, zIndex: 1 },
  dotContainer: { height: 60, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  currentDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#fff' },
  targetDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
  nodeText: { fontSize: 10, textAlign: 'center', marginTop: 5, width: '100%' },

  lcdDistanceBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  lcdDistanceLabel: { color: '#aaa', fontSize: 14 },
  lcdDistanceValue: { color: '#fff', fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' },
  pointerLayer: { position: 'absolute', left: 0, right: 0, bottom: 12, height: 18, justifyContent: 'center' },
  pointerArrow: { position: 'absolute', width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 12, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#ff3b30' },
});