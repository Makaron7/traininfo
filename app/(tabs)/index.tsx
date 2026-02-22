import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useState } from 'react';
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
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppPermissions } from '@/hooks/useAppPermissions';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useNotification } from '@/hooks/useNotification';
import { Station, TrainLine } from '@/hooks/train-types';
import { useTrainData } from '@/hooks/useTrainData';
import { TrainLCD as TrainLCDView } from '@/features/train/TrainLCD';
import { Colors } from '@/features/train/theme';
import { getLineColor } from '@/features/train/constants';

const ANDROID_CHANNEL_ID = 'train-alarm-v2';
const VIBRATION_PATTERN_STRONG = [0, 800, 200, 800, 200, 800];

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

// ThemeColors/Colors are provided by features/train/theme

// Legacy constants were migrated to features/train/constants.

export default function App() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  
  const {
    isLoadingAPI,
    foundLines,
    setFoundLines,
    loadLines,
    searchLinesFromStation: searchLinesFromStationApi,
    downloadLine: downloadLineApi,
  } = useTrainData({ resolveLineColor: getLineColor });

  const [selectedLine, setSelectedLine] = useState<TrainLine | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  const { settings, saveSettings } = useAppSettings();
  const { hasNotificationPermission, isHeadphonesConnected } = useAppPermissions({
    androidChannelId: ANDROID_CHANNEL_ID,
    vibrationPattern: VIBRATION_PATTERN_STRONG,
  });
  
  // モーダル関連State
  const [modalVisible, setModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [inputLineName, setInputLineName] = useState("");

  const { triggerVibration, sendNotification: sendNotificationCore, resetNotification } = useNotification(settings);

  const onArrive = useCallback((stationName: string) => {
    if (!hasNotificationPermission.current) return;
    void sendNotificationCore(stationName, isHeadphonesConnected.current);
  }, [hasNotificationPermission, isHeadphonesConnected, sendNotificationCore]);

  const {
    isTracking,
    distance,
    isArrived,
    currentStationIndex,
    nearestStationDistance,
    startTracking,
    stopTracking,
    setDistance,
    setNearestStationDistance,
    setIsArrived,
  } = useLocationTracking({
    selectedStation,
    selectedLine,
    settings,
    onArrive,
  });

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  // 通知受信時に確実にハプティクスを鳴らす（フォアグラウンドでも発火）
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      if (Platform.OS === 'android') return; // Androidは通知自体がバイブするので二重振動を防ぐ
      triggerVibration();
    });

    return () => {
      subscription.remove();
    };
  }, [triggerVibration]);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setInputLineName('');
    setFoundLines([]);
  }, [setFoundLines]);

  const downloadLine = useCallback(async (name: string) => {
    const lineName = name.trim();
    if (!lineName) {
      Alert.alert('入力エラー', '路線名または駅名を入力してください');
      return;
    }
    const created = await downloadLineApi(lineName);
    if (created) {
      setSelectedLine(created);
      setSelectedStation(null);
      setInputLineName('');
      setFoundLines([]);
      setModalVisible(false);
    }
  }, [downloadLineApi, setFoundLines]);

  const searchLinesFromStation = useCallback(async () => {
    const stationName = inputLineName.trim();
    if (!stationName) {
      Alert.alert('入力エラー', '駅名を入力してください');
      return;
    }
    Keyboard.dismiss();
    await searchLinesFromStationApi(stationName);
  }, [inputLineName, searchLinesFromStationApi]);

  const startOrStopTracking = useCallback(async () => {
    if (isTracking) {
      await stopTracking();
      await resetNotification();
      return;
    }
    if (!selectedStation) {
      Alert.alert('駅を選択', '通知する駅を選んでください');
      return;
    }
    await resetNotification();
    await startTracking();
  }, [isTracking, resetNotification, selectedStation, startTracking, stopTracking]);

  const clearSelection = useCallback(async () => {
    await stopTracking();
    await resetNotification();
    setSelectedLine(null);
    setSelectedStation(null);
    setDistance(null);
    setNearestStationDistance(null);
    setIsArrived(false);
  }, [resetNotification, setDistance, setIsArrived, setNearestStationDistance, stopTracking]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}> 
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {selectedLine && selectedStation && distance !== null && (
        <View style={styles.lcdWrapper}>
          <TrainLCDView
            targetStation={selectedStation}
            distance={distance}
            isArrived={isArrived}
            lineName={selectedLine.name}
            lineColor={selectedLine.color}
            stations={selectedLine.stations}
            currentStationIndex={currentStationIndex}
            nearestStationDistance={nearestStationDistance}
            theme={theme}
          />
        </View>
      )}

      {!selectedLine && (
        <View style={styles.section}>
          <Text style={[styles.emptyText, { color: theme.subText }]}>路線データがありません</Text>
        </View>
      )}

      {selectedLine && (
        <View style={styles.section}>
          {selectedStation ? (
            <>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>通知駅</Text>
              <View style={[styles.stationRow, { borderBottomColor: theme.border }]}>
                <Text style={[styles.stationName, { color: theme.text }]}>{selectedStation.name}</Text>
                <TouchableOpacity onPress={() => setSelectedStation(null)}>
                  <Text style={styles.checkMark}>変更</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>通知駅を選択</Text>
              <FlatList
                data={selectedLine.stations}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const checked = selectedStation?.id === item.id;
                  return (
                    <TouchableOpacity
                      style={[styles.stationRow, { borderBottomColor: theme.border }]}
                      onPress={() => setSelectedStation(item)}
                    >
                      <Text style={[styles.stationName, { color: theme.text }]}>{item.name}</Text>
                      {checked && <Text style={styles.checkMark}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 220 }}
              />
            </>
          )}
        </View>
      )}

      {isTracking && (
        <View style={[styles.debugPanel, { borderColor: theme.border, backgroundColor: theme.card }]}> 
          <View style={styles.debugRow}>
            <Text style={[styles.debugLabel, { color: theme.subText }]}>通知先</Text>
            <Text style={[styles.debugValue, { color: theme.text }]}>{selectedStation?.name ?? '-'}</Text>
          </View>
          <View style={styles.debugRow}>
            <Text style={[styles.debugLabel, { color: theme.subText }]}>距離</Text>
            <Text style={[styles.debugValue, { color: theme.text }]}>{distance ?? '-'} m</Text>
          </View>
          <View style={styles.debugRow}>
            <Text style={[styles.debugLabel, { color: theme.subText }]}>最寄り駅距離</Text>
            <Text style={[styles.debugValue, { color: theme.text }]}>{nearestStationDistance ?? '-'} m</Text>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.startButton,
            !isTracking && !selectedStation && styles.disabledButton,
            isTracking && { backgroundColor: '#ff3b30' },
          ]}
          onPress={() => { void startOrStopTracking(); }}
          disabled={!isTracking && !selectedStation}
        >
          <Text style={styles.startButtonText}>{isTracking ? '追跡停止' : '追跡開始'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ alignSelf: 'center', marginTop: 12 }} onPress={() => { void clearSelection(); }}>
          <Text style={styles.clearText}>選択をクリア</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: theme.modalBg }]}> 
          <Text style={[styles.modalTitle, { color: theme.text }]}>路線追加</Text>
          <Text style={[styles.modalDesc, { color: theme.subText }]}>路線名または駅名を入力</Text>

          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
            placeholder="例: 京成松戸線 / 新津田沼"
            placeholderTextColor={theme.subText}
            value={inputLineName}
            onChangeText={setInputLineName}
          />

          {isLoadingAPI ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : foundLines.length > 0 ? (
            <View style={{ flex: 1, width: '100%', marginBottom: 10 }}>
              <Text style={{ color: theme.subText, marginBottom: 5 }}>「{inputLineName}」を通る路線</Text>
              <FlatList
                data={foundLines}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.searchResultItem, { borderBottomColor: theme.border }]}
                    onPress={() => { void downloadLine(item); }}
                  >
                    <Text style={{ color: theme.text, fontSize: 16 }}>{item}</Text>
                    <Text style={{ color: '#007AFF' }}>追加</Text>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity style={styles.backButton} onPress={() => setFoundLines([])}>
                <Text style={{ color: theme.subText }}>検索に戻る</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ width: '100%' }}>
              <TouchableOpacity
                style={[styles.downloadButton, { backgroundColor: '#007AFF', marginBottom: 10 }]}
                onPress={() => { void downloadLine(inputLineName); }}
              >
                <Text style={styles.buttonText}>路線名として追加</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.downloadButton, { backgroundColor: '#34C759' }]}
                onPress={() => { void searchLinesFromStation(); }}
              >
                <Text style={styles.buttonText}>駅名から路線を検索</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
            <Text style={styles.closeText}>閉じる</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={settingsModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: theme.modalBg }]}> 
          <Text style={[styles.modalTitle, { color: theme.text }]}>設定</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>イヤホン時のみ音を鳴らす</Text>
              <Text style={[styles.settingDesc, { color: theme.subText }]}>電車内での使用に推奨</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleButton, settings.soundOnlyWithHeadphones && styles.toggleButtonActive]}
              onPress={() => saveSettings({ ...settings, soundOnlyWithHeadphones: !settings.soundOnlyWithHeadphones })}
            >
              <Text style={styles.toggleText}>{settings.soundOnlyWithHeadphones ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>バイブレーション</Text>
              <Text style={[styles.settingDesc, { color: theme.subText }]}>振動で通知</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleButton, settings.vibrationEnabled && styles.toggleButtonActive]}
              onPress={() => saveSettings({ ...settings, vibrationEnabled: !settings.vibrationEnabled })}
            >
              <Text style={styles.toggleText}>{settings.vibrationEnabled ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>到着通知距離</Text>
              <Text style={[styles.settingDesc, { color: theme.subText }]}>現在: {settings.arrivalThreshold}m</Text>
            </View>
          </View>

          <View style={styles.sliderContainer}>
            {[300, 500, 800, 1000].map((threshold) => (
              <TouchableOpacity key={threshold} style={styles.distanceButton} onPress={() => saveSettings({ ...settings, arrivalThreshold: threshold })}>
                <Text style={[styles.distanceButtonText, settings.arrivalThreshold === threshold && { color: '#007AFF', fontWeight: 'bold' }]}>{threshold}m</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={() => setSettingsModalVisible(false)}>
            <Text style={styles.closeText}>閉じる</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
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
  cardText: { fontWeight: 'bold' },
  selectedCardText: { color: '#fff' },
  deleteBadge: { position: 'absolute', right: 5, top: -5, backgroundColor: '#ccc', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 1, borderColor: '#fff' },
  deleteText: { color: 'white', fontWeight: 'bold', fontSize: 12 },

  stationRow: { flexDirection: 'row', paddingVertical: 15, borderBottomWidth: 1 },
  stationName: { fontSize: 16 },
  checkMark: { marginLeft: 'auto', color: '#007AFF', fontWeight: 'bold' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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

  debugPanel: { borderWidth: 1, borderRadius: 10, padding: 12, marginHorizontal: 20, marginVertical: 15 },
  debugRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  debugLabel: { fontSize: 13, fontWeight: '500' },
  debugValue: { fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  lcdWrapper: { width: '95%', alignSelf: 'center', marginTop: 20, marginBottom: 20, elevation: 5, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
});