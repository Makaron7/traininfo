import { useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';
import { AppSettings } from './train-types';

const ANDROID_CHANNEL_ID = 'train-alarm-v2';
const NOTIFICATION_COOLDOWN_MS = 5000;
const NOTIFICATION_PATTERN_DURATION_MS = Platform.OS === 'android' ? 1800 : 1200;
const EXTRA_VIBRATION_ROUNDS = 10;
const EXTRA_VIBRATION_GAP_MS = 1200;
const VIBRATION_PATTERN_STRONG = [0, 800, 200, 800, 200, 800] as const;

export const useNotification = (settings: AppSettings) => {
  const hasNotified = useRef(false);
  const lastNotificationTime = useRef(0);
  const extraVibrationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const triggerVibration = useCallback(async () => {
    if (!settings.vibrationEnabled) return;

    if (Platform.OS === 'ios') {
      const pulses = [
        () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
        () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
      ];
      for (const pulse of pulses) {
        await pulse();
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
      return;
    }

    Vibration.vibrate(VIBRATION_PATTERN_STRONG as unknown as number[]);
  }, [settings.vibrationEnabled]);

  const sendNotification = useCallback(async (stationName: string, isHeadphonesConnected: boolean) => {
    if (hasNotified.current) return;

    const now = Date.now();
    if (now - lastNotificationTime.current < NOTIFICATION_COOLDOWN_MS) return;

    hasNotified.current = true;
    lastNotificationTime.current = now;

    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.dismissAllNotificationsAsync();

      const shouldPlaySound = settings.soundOnlyWithHeadphones ? isHeadphonesConnected : true;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'まもなく到着',
          body: `${stationName}付近です`,
          sound: shouldPlaySound ? 'default' : undefined,
          vibrate: Platform.OS === 'android' && settings.vibrationEnabled ? (VIBRATION_PATTERN_STRONG as unknown as number[]) : undefined,
        },
        trigger: null,
      });

      if (settings.vibrationEnabled) {
        extraVibrationTimers.current.forEach(clearTimeout);
        extraVibrationTimers.current = [];
        for (let index = 0; index < EXTRA_VIBRATION_ROUNDS; index += 1) {
          const delay = (NOTIFICATION_PATTERN_DURATION_MS + EXTRA_VIBRATION_GAP_MS) * (index + 1);
          const timer = setTimeout(() => {
            triggerVibration();
          }, delay);
          extraVibrationTimers.current.push(timer);
        }
      }
    } catch {
      hasNotified.current = false;
    }
  }, [settings, triggerVibration]);

  const resetNotification = useCallback(async () => {
    hasNotified.current = false;
    extraVibrationTimers.current.forEach(clearTimeout);
    extraVibrationTimers.current = [];
    await Notifications.cancelAllScheduledNotificationsAsync();
  }, []);

  return {
    triggerVibration,
    sendNotification,
    resetNotification,
    hasNotified,
    channelId: ANDROID_CHANNEL_ID,
  };
};
