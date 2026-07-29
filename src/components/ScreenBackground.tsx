import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type ViewProps } from 'react-native';
import { useColors } from '../theme';

// Uygulama kabuğu zemini — üstte bgMid (sayfa/scroll alanı tonu), altta bgDeep (en dış
// zemin) arasında hafif bir gradient. Tamamen dekoratif (kritik metin/veri taşımıyor).
export function ScreenBackground({ style, ...props }: ViewProps) {
  const colors = useColors();
  return (
    <LinearGradient
      colors={[colors.bgMid, colors.bgDeep]}
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
