import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HeartRailsResponse, Station, TrainLine } from './train-types';

type UseTrainDataOptions = {
  resolveLineColor?: (lineName: string) => string;
};

const createFallbackColor = (name: string): string => {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  const value = (hash & 0x00ffffff).toString(16).toUpperCase();
  return `#${'00000'.substring(0, 6 - value.length)}${value}`;
};

export const useTrainData = ({ resolveLineColor }: UseTrainDataOptions = {}) => {
  const [savedLines, setSavedLines] = useState<TrainLine[]>([]);
  const [isLoadingAPI, setIsLoadingAPI] = useState(false);
  const [foundLines, setFoundLines] = useState<string[]>([]);

  const loadLines = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('SavedTrainLines');
      if (raw) {
        setSavedLines(JSON.parse(raw));
      }
    } catch {
      Alert.alert('読み込みエラー', '路線データの読み込みに失敗しました');
    }
  }, []);

  const saveLines = useCallback(async (lines: TrainLine[]) => {
    await AsyncStorage.setItem('SavedTrainLines', JSON.stringify(lines));
    setSavedLines(lines);
  }, []);

  const searchLinesFromStation = useCallback(async (stationName: string) => {
    if (!stationName) return [];
    setIsLoadingAPI(true);
    setFoundLines([]);
    try {
      const response = await fetch(`https://express.heartrails.com/api/json?method=getStations&name=${encodeURIComponent(stationName)}`);
      const json: HeartRailsResponse = await response.json();
      const lines = Array.from(
        new Set((json.response?.station ?? []).map((station) => station.line).filter((line): line is string => Boolean(line))),
      );
      setFoundLines(lines);
      return lines;
    } catch {
      Alert.alert('通信エラー', '路線検索に失敗しました');
      return [];
    } finally {
      setIsLoadingAPI(false);
    }
  }, []);

  const downloadLine = useCallback(async (lineName: string) => {
    if (!lineName) return null;

    setIsLoadingAPI(true);
    try {
      const response = await fetch(`https://express.heartrails.com/api/json?method=getStations&line=${encodeURIComponent(lineName)}`);
      const json: HeartRailsResponse = await response.json();
      const stationsRaw = json.response?.station ?? [];
      if (!stationsRaw.length) {
        Alert.alert('エラー', '駅情報が見つかりませんでした。');
        return null;
      }

      const stations: Station[] = stationsRaw.map((station) => ({
        id: `${station.name}_${station.y}_${station.x}`,
        name: station.name,
        latitude: Number.parseFloat(station.y),
        longitude: Number.parseFloat(station.x),
      }));

      const newLine: TrainLine = {
        id: Date.now().toString(),
        name: lineName,
        stations,
        color: resolveLineColor?.(lineName) ?? createFallbackColor(lineName),
      };

      if (savedLines.some((line) => line.name === newLine.name)) {
        Alert.alert('確認', `${lineName} は既に保存済みです`);
        return null;
      }

      const newLines = [...savedLines, newLine];
      await saveLines(newLines);
      setFoundLines([]);
      return newLine;
    } catch {
      Alert.alert('通信エラー', '路線データの取得に失敗しました');
      return null;
    } finally {
      setIsLoadingAPI(false);
    }
  }, [resolveLineColor, savedLines, saveLines]);

  const deleteLine = useCallback((lineId: string) => {
    Alert.alert('削除の確認', 'この路線データを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          const newLines = savedLines.filter((line) => line.id !== lineId);
          await saveLines(newLines);
        },
      },
    ]);
  }, [savedLines, saveLines]);

  return {
    savedLines,
    isLoadingAPI,
    foundLines,
    setFoundLines,
    loadLines,
    saveLines,
    searchLinesFromStation,
    downloadLine,
    deleteLine,
  };
};
