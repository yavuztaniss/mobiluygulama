import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useColors, type AppColors, fontFamily } from '../../../src/theme';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return <Text style={[styles.icon, { color: focused ? colors.accent : colors.textDim }]}>{symbol}</Text>;
}

export default function VeliTabsLayout() {
  const colors = useColors();
  const styles = createStyles(colors);
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
      <Tabs.Screen name="index" options={{ title: 'Ana Sayfa', tabBarIcon: ({ focused }) => <TabIcon symbol="⌂" focused={focused} /> }} />
      <Tabs.Screen name="servis" options={{ title: 'Servis', tabBarIcon: ({ focused }) => <TabIcon symbol="🚌" focused={focused} /> }} />
      <Tabs.Screen name="odemeler" options={{ title: 'Ödemeler', tabBarIcon: ({ focused }) => <TabIcon symbol="▤" focused={focused} /> }} />
      <Tabs.Screen name="mesajlar" options={{ title: 'Mesajlar', tabBarIcon: ({ focused }) => <TabIcon symbol="💬" focused={focused} /> }} />
      <Tabs.Screen name="magaza" options={{ title: 'Mağaza', tabBarIcon: ({ focused }) => <TabIcon symbol="🛍" focused={focused} /> }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabIcon symbol="◍" focused={focused} /> }} />
    </Tabs>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    bar: { backgroundColor: colors.panel, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 8 },
    label: { fontFamily: fontFamily.manropeSemi, fontSize: 10.5 },
    icon: { fontSize: 16 },
  });
}
