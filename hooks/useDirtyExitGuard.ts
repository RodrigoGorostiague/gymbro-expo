import { useContext } from 'react';
import { Alert } from 'react-native';
import { NavigationContext, usePreventRemove } from 'expo-router/react-navigation';
/** Navigation-owned interception preserves the original back/tab action after confirmation. */
export function useDirtyExitGuard(dirty: boolean, saving = false) {
  const navigation = useContext(NavigationContext);
  usePreventRemove(dirty || saving, ({ data }) => {
    if (saving || !navigation) return;
    Alert.alert('Tienes cambios sin guardar', 'Puedes volver para guardarlos o salir sin aplicarlos.', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Salir sin guardar', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}
