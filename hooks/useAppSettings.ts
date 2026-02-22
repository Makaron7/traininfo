import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { AppSettings, DEFAULT_SETTINGS } from './train-types';

export const useAppSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const loadSettings = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('AppSettings');
      if (raw) {
        setSettings(JSON.parse(raw));
      }
    } catch {
      Alert.alert('読み込みエラー', '設定の読み込みに失敗しました');
    }
  }, []);

  const saveSettings = useCallback(async (nextSettings: AppSettings) => {
    try {
      await AsyncStorage.setItem('AppSettings', JSON.stringify(nextSettings));
      setSettings(nextSettings);
    } catch {
      Alert.alert('保存エラー', '設定の保存に失敗しました');
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return {
    settings,
    setSettings,
    saveSettings,
    loadSettings,
  };
};
