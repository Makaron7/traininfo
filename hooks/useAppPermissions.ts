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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('権限エラー', '位置情報の使用を許可してください');
        return;
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
    } catch {
      // no-op
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
