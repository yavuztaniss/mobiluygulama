import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type ViewProps } from 'react-native';
import { useColors } from '../theme';

// Mockup'taki radial-gradient(#13284C -> #0A1628) yerine RN'de linear yaklaşımı.
export function ScreenBackground({ style, ...props }: ViewProps) {
  const colors = useColors();
  return (
    <LinearGradient
      colors={[colors.navyBgGradientTop, colors.navyBg]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 0.6 }}
      style={[styles.fill, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
