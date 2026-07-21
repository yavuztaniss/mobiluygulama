import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useColors, type AppColors, fontFamily } from '../../../src/theme';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <Text style={[styles.icon, { color: focused ? colors.accent : colors.textFaint }]}>{symbol}</Text>
  );
}

export default function YoneticiTabsLayout() {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Özet', tabBarIcon: ({ focused }) => <TabIcon symbol="◆" focused={focused} /> }}
      />
      <Tabs.Screen
        name="sporcular"
        options={{ title: 'Sporcular', tabBarIcon: ({ focused }) => <TabIcon symbol="●" focused={focused} /> }}
      />
      <Tabs.Screen
        name="finans"
        options={{ title: 'Finans', tabBarIcon: ({ focused }) => <TabIcon symbol="▲" focused={focused} /> }}
      />
      <Tabs.Screen
        name="takvim"
        options={{ title: 'Takvim', tabBarIcon: ({ focused }) => <TabIcon symbol="▦" focused={focused} /> }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'Menü', tabBarIcon: ({ focused }) => <TabIcon symbol="≡" focused={focused} /> }}
      />
    </Tabs>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    bar: {
      backgroundColor: colors.navySurface,
      borderTopColor: colors.navyBorder,
      height: 64,
      paddingBottom: 8,
      paddingTop: 8,
    },
    label: {
      fontFamily: fontFamily.manropeSemi,
      fontSize: 10.5,
    },
    icon: {
      fontSize: 16,
    },
  });
}
