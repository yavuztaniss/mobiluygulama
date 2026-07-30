import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useOzellik } from '../../../src/context/OzellikContext';
import { useColors, type AppColors, fontFamily, fontSize } from '../../../src/theme';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return <Text style={[styles.icon, { color: focused ? colors.accent : colors.textDim }]}>{symbol}</Text>;
}

export default function AntrenorTabsLayout() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { ozellikAcik } = useOzellik();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: ({ focused }) => <TabIcon symbol="▦" focused={focused} /> }} />
      <Tabs.Screen name="sporcular" options={{ title: 'Sporcular', tabBarIcon: ({ focused }) => <TabIcon symbol="●" focused={focused} /> }} />
      {/* href: null sekmeyi tab bar'dan gizler (expo-router'ın dokümante yöntemi) — bayrak kapalıyken uygulanır. */}
      <Tabs.Screen
        name="mesajlar"
        options={{ title: 'Mesajlar', href: ozellikAcik('mesajlar') ? undefined : null, tabBarIcon: ({ focused }) => <TabIcon symbol="💬" focused={focused} /> }}
      />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon symbol="◍" focused={focused} /> }} />
    </Tabs>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    bar: { backgroundColor: colors.panel, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 8 },
    label: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm },
    icon: { fontSize: 16 },
  });
}
