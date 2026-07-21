import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';

export default function AuthLayout() {
  const { profile, loading } = useAuth();

  if (!loading && profile) {
    if (profile.role === 'yonetici') return <Redirect href="/(yonetici)" />;
    if (profile.role === 'veli') return <Redirect href="/(veli)" />;
    return <Redirect href="/(antrenor)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
