import { Modal, Platform, type ModalProps } from 'react-native';

// react-native-web'in fade/slide kapanış animasyonu bazı ortamlarda
// 'animationend' event'i hiç tetiklemiyor ve modal opacity:1 halde DOM'da takılı kalıyor.
// Native tarafta gerçek Modal kullanıldığı için sorun yok; web'de animasyonu kapatıyoruz.
export function AppModal({ animationType, ...props }: ModalProps) {
  const resolvedAnimation = Platform.OS === 'web' ? 'none' : animationType;
  return <Modal animationType={resolvedAnimation} {...props} />;
}
