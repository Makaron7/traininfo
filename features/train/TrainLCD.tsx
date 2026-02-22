import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Station } from '@/hooks/train-types';
import { CONFIG, getStationNumber } from './constants';
import { ThemeColors } from './theme';

type DisplayStation = Station & { status: 'passed' | 'current' | 'future' };

type TrainLCDProps = {
  targetStation: Station;
  distance: number;
  isArrived: boolean;
  lineName?: string;
  lineColor?: string;
  stations: Station[];
  currentStationIndex: number;
  nearestStationDistance: number | null;
  theme: ThemeColors;
};

export function TrainLCD({ targetStation, distance, lineName, lineColor, stations, currentStationIndex, nearestStationDistance, theme }: TrainLCDProps) {
  const themeColor = lineColor || '#007AFF';
  const targetIdx = stations.findIndex((station) => station.id === targetStation.id);
  const hasValidCurrentIndex = currentStationIndex >= 0 && currentStationIndex < stations.length;
  const isReverse = hasValidCurrentIndex && targetIdx >= 0 ? currentStationIndex > targetIdx : false;
  let nextIdx = isReverse ? currentStationIndex - 1 : currentStationIndex + 1;

  if (!hasValidCurrentIndex && targetIdx >= 0) nextIdx = targetIdx;
  if (nextIdx < 0) nextIdx = 0;
  if (nextIdx >= stations.length) nextIdx = stations.length - 1;
  if ((!isReverse && nextIdx > targetIdx) || (isReverse && nextIdx < targetIdx)) nextIdx = targetIdx;

  const nextStation = stations.length > 0 && nextIdx >= 0 ? stations[nextIdx] : targetStation;
  const isBetweenStations = nearestStationDistance !== null && nearestStationDistance > CONFIG.CURRENT_STATION_THRESHOLD;
  const currentStation = hasValidCurrentIndex ? stations[currentStationIndex] : null;
  const isStoppedAtStation = nearestStationDistance !== null && nearestStationDistance <= CONFIG.STOPPED_STATION_THRESHOLD;
  const isCurrentStopMode = isStoppedAtStation && !!currentStation;
  const isApproachingStation = !isCurrentStopMode && nearestStationDistance !== null && nearestStationDistance > CONFIG.STOPPED_STATION_THRESHOLD && nearestStationDistance <= CONFIG.CURRENT_STATION_THRESHOLD;
  const isCurrentStopAtTarget = isCurrentStopMode && currentStation?.id === targetStation.id;
  const mainDisplayStation = isCurrentStopMode && currentStation ? currentStation : nextStation;

  let headerTextJa = '次は';
  let headerTextEn = 'Next';
  let labelColor = theme.lcdSubText;

  if (isCurrentStopMode) {
    headerTextJa = 'ただいま';
    headerTextEn = 'Current Station';
    labelColor = isCurrentStopAtTarget ? '#ff3b30' : theme.lcdSubText;
  } else if (isApproachingStation) {
    headerTextJa = 'まもなく';
    headerTextEn = 'Arriving';
    labelColor = '#ff9500';
  }

  const targetNumber = getStationNumber(lineName, targetStation.name);
  const displayTargetStr = targetNumber ? `${targetStation.name} (${targetNumber})` : targetStation.name;
  const displayNumberStr = getStationNumber(lineName, mainDisplayStation.name);
  const stationAfterCurrent = isCurrentStopMode && currentStation && nextStation.id !== currentStation.id ? nextStation : null;

  const startIdx = isReverse ? currentStationIndex + 1 : currentStationIndex - 1;
  const count = Math.min(CONFIG.LCD_DISPLAY_COUNT, stations.length);
  const displayStations: (DisplayStation | null)[] = [];

  for (let index = 0; index < count; index += 1) {
    const stationIndex = isReverse ? startIdx - index : startIdx + index;
    if (stationIndex < 0 || stationIndex >= stations.length) {
      displayStations.push(null);
      continue;
    }

    const station = stations[stationIndex];
    let status: 'passed' | 'current' | 'future' = 'future';
    if (!isBetweenStations && stationIndex === currentStationIndex) status = 'current';
    if (isReverse) {
      if (stationIndex > currentStationIndex || (isBetweenStations && stationIndex === currentStationIndex)) status = 'passed';
    } else if (stationIndex < currentStationIndex || (isBetweenStations && stationIndex === currentStationIndex)) {
      status = 'passed';
    }
    displayStations.push({ ...station, status });
  }

  const currentDisplayIdx = displayStations.findIndex((station) => station?.id === currentStation?.id);
  const nextDisplayIdx = displayStations.findIndex((station) => station?.id === nextStation.id);
  const betweenSegmentStartIdx =
    isBetweenStations && currentDisplayIdx >= 0 && nextDisplayIdx >= 0 && Math.abs(currentDisplayIdx - nextDisplayIdx) === 1
      ? Math.min(currentDisplayIdx, nextDisplayIdx)
      : -1;

  return (
    <View style={[styles.lcdContainer, { backgroundColor: theme.lcdBg, borderColor: theme.lcdBorder }]}> 
      <View style={[styles.lcdHeader, { backgroundColor: themeColor }]}> 
        <Text style={styles.lcdLineName}>{lineName || 'Train Line'}</Text>
      </View>

      <View style={[styles.lcdBody, { backgroundColor: theme.lcdBg }]}> 
        <View style={styles.absoluteLabelContainer}>
          <Text style={[styles.lcdNextLabel, { color: labelColor }]}>{headerTextJa}</Text>
          <Text style={[styles.lcdNextLabelEn, { color: labelColor }]}>{headerTextEn}</Text>
        </View>
        <Text style={[styles.lcdStationName, { color: theme.lcdText }]} numberOfLines={1} adjustsFontSizeToFit>
          {mainDisplayStation.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[styles.lcdStationNameSub, { color: theme.lcdSubText }]}>{mainDisplayStation.name} Station</Text>
          {displayNumberStr ? (
            <Text style={[styles.lcdStationNameSub, { color: theme.lcdSubText, marginLeft: 8, fontWeight: 'bold' }]}>({displayNumberStr})</Text>
          ) : null}
        </View>

        {stationAfterCurrent && (
          <View style={styles.nextStationPreview}>
            <Text style={[styles.nextStationPreviewLabel, { color: theme.lcdSubText }]}>Next</Text>
            <Text style={[styles.nextStationPreviewName, { color: theme.lcdText }]}>{stationAfterCurrent.name}</Text>
          </View>
        )}
      </View>

      <View style={[styles.lcdRouteContainer, { backgroundColor: theme.lcdBg, borderTopColor: theme.lcdBorder }]}> 
        <View style={styles.stationsRow}>
          {displayStations.map((station, index) => {
            if (!station) return <View key={index} style={styles.stationNode} />;

            const isCurrent = station.status === 'current';
            const isTarget = station.id === targetStation.id;
            let nodeColor = theme.border;
            let textColor = theme.lcdSubText;

            if (isCurrent) {
              nodeColor = isCurrentStopAtTarget ? '#ff3b30' : themeColor;
              textColor = theme.lcdText;
            } else if (station.status === 'future') {
              nodeColor = themeColor;
            }

            if (isTarget && !isCurrent) {
              nodeColor = '#ff3b30';
              textColor = '#ff3b30';
            }

            const nextNode = index < count - 1 ? displayStations[index + 1] : null;
            const isActiveByStatus = !!nextNode && station.status !== 'passed' && nextNode.status !== 'passed';
            const isActiveBetween = isBetweenStations && index === betweenSegmentStartIdx;

            return (
              <View key={index} style={styles.stationNode}>
                {index < count - 1 && (
                  <>
                    <View style={[styles.trackLine, { backgroundColor: theme.border }]} />
                    {(isActiveByStatus || isActiveBetween) && <View style={[styles.activeLine, { backgroundColor: themeColor }]} />}
                  </>
                )}

                {isBetweenStations && index === betweenSegmentStartIdx && (
                  <View style={[styles.pointerMarker, { left: '100%', borderColor: themeColor, backgroundColor: theme.lcdBg }]}>
                    <Text style={[styles.pointerGlyph, { color: themeColor }]}>{isReverse ? '◀' : '▶'}</Text>
                  </View>
                )}

                <View style={styles.dotContainer}>
                  <View style={[styles.dot, { backgroundColor: nodeColor }, isCurrent && styles.currentDot, isTarget && !isCurrent && styles.targetDot]} />
                </View>
                <Text style={[styles.nodeText, { color: textColor }, isCurrent && { fontWeight: 'bold', color: theme.lcdText }, isTarget && !isCurrent && { fontWeight: 'bold', color: '#ff3b30' }]} numberOfLines={1}>
                  {station.name}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.lcdDistanceBox, { backgroundColor: '#1c1c1e' }]}>
        <Text style={styles.lcdDistanceLabel}>{displayTargetStr} まで およそ</Text>
        <Text style={styles.lcdDistanceValue}>{isStoppedAtStation && isCurrentStopAtTarget ? '到着' : `${distance} m`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lcdContainer: { borderRadius: 10, overflow: 'hidden', borderWidth: 1 },
  lcdHeader: { padding: 12, paddingHorizontal: 20, justifyContent: 'center' },
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
  stationsRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 10 },
  stationNode: { flex: 1, alignItems: 'center', position: 'relative' },
  trackLine: { position: 'absolute', top: 28, left: '50%', width: '100%', height: 4, borderRadius: 2, zIndex: 0 },
  activeLine: { position: 'absolute', top: 28, left: '50%', width: '100%', height: 4, borderRadius: 2, zIndex: 1 },
  dotContainer: { height: 60, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  currentDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#fff' },
  targetDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
  nodeText: { fontSize: 10, textAlign: 'center', marginTop: 5, width: '100%' },
  lcdDistanceBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  lcdDistanceLabel: { color: '#aaa', fontSize: 14 },
  lcdDistanceValue: { color: '#fff', fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' },
  pointerMarker: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    top: 17,
    transform: [{ translateX: -11 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.5,
    elevation: 3,
    zIndex: 3,
  },
  pointerGlyph: { fontSize: 11, fontWeight: '800', lineHeight: 13 },
});
