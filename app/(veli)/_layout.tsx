import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { ChildProvider } from '../../src/context/ChildContext';
import { useColors } from '../../src/theme';

export default function VeliLayout() {
  const { session, profile, loading } = useAuth();
  const colors = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgDeep }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session && !profile) return <Redirect href="/(auth)/login" />;
  if (profile && profile.role !== 'veli') return <Redirect href="/" />;

  return (
    <ChildProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ChildProvider>
  );
}
