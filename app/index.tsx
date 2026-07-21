import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useColors } from '../src/theme';

export default function Index() {
  const { profile, loading } = useAuth();
  const colors = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navyBg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!profile) return <Redirect href="/(auth)/login" />;

  if (profile.role === 'yonetici') return <Redirect href="/(yonetici)" />;
  if (profile.role === 'veli') return <Redirect href="/(veli)" />;
  return <Redirect href="/(antrenor)" />;
}
