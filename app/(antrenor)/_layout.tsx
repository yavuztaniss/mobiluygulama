import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useColors } from '../../src/theme';

export default function AntrenorLayout() {
  const { session, profile, loading } = useAuth();
  const colors = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navyBg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session && !profile) return <Redirect href="/(auth)/login" />;
  if (profile && profile.role !== 'antrenor') return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
