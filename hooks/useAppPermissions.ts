import { useCallback, useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

type UseAppPermissionsParams = {
  androidChannelId: string;
  vibrationPattern: number[];
};

export const useAppPermissions = ({ androidChannelId, vibrationPattern }: UseAppPermissionsParams) => {
  const hasNotificationPermission = useRef(false);
  const isHeadphonesConnected = useRef(true);

  const requestPermissions = useCallback(async () => {
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert('権限エラー', '位置情報の使用を許可してください');
        return;
      }

      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        Alert.alert(
          'バックグラウンド権限が必要',
          'アプリを閉じてもアラームを鳴らすために、設定から位置情報を「常に許可」にしてください。',
        );
      }

      const notificationResult = await Notifications.requestPermissionsAsync();
      hasNotificationPermission.current = notificationResult.status === 'granted';

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(androidChannelId, {
          name: 'Train Alarm',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern,
          enableVibrate: true,
          sound: 'default',
        });
      }
    } catch (e) {
      console.warn('Permission Error:', e);
    }
  }, [androidChannelId, vibrationPattern]);

  useEffect(() => {
    isHeadphonesConnected.current = true;
    void requestPermissions();
  }, [requestPermissions]);

  return {
    hasNotificationPermission,
    isHeadphonesConnected,
    requestPermissions,
  };
};
