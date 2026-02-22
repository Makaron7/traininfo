import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // 上のヘッダーを消す
        tabBarStyle: { display: 'none' }, // 下のタブバーを消す
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null, // exploreページへのリンクを無効化
        }}
      />
    </Tabs>
  );
}