import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Alert,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PARTNER_MESSAGES, PartnerMessageType } from '../constants/kiss';
import { useShop } from '../context/ShopContext';
import { useTheme } from '../context/ThemeContext';
import { sendPartnerMessage } from '../services/partnerMessages';
import { vibrateButtonPress } from '../utils/haptics';

const FAB_SIZE = 58;
const SATELLITE_SIZE = 50;
const RADIUS = 78;

const MENU_ITEMS: PartnerMessageType[] = ['kiss', 'muscle', 'angry', 'cry'];
const MENU_ANGLES = [75, 105, 135, 165];
const DOT_SWING = 3.5;
const SWING_DURATION = 520;

function satelliteOffset(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: RADIUS * Math.cos(rad),
    y: -RADIUS * Math.sin(rad),
  };
}

function AnimatedChatIcon({
  bubbleColor,
  dotColor,
  size = 28,
}: {
  bubbleColor: string;
  dotColor: string;
  size?: number;
}) {
  const phase = useRef(new Animated.Value(0)).current;
  const dotSize = size * 0.14;
  const dotGap = size * 0.07;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 3,
        duration: SWING_DURATION * 3,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loop.start();
    return () => loop.stop();
  }, [phase]);

  const dotOffsets = [0, 1, 2].map((index) =>
    phase.interpolate({
      inputRange: [index, index + 0.5, index + 1],
      outputRange: [0, DOT_SWING, 0],
      extrapolate: 'clamp',
    }),
  );

  const dotStyle = {
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: dotColor,
  };

  return (
    <View style={[chatIconStyles.wrap, { width: size, height: size }]}>
      <Ionicons name="chatbubble" size={size} color={bubbleColor} />
      <View style={[chatIconStyles.dotsRow, { bottom: size * 0.27, gap: dotGap }]}>
        {dotOffsets.map((offsetY, index) => (
          <Animated.View
            key={index}
            style={[dotStyle, { transform: [{ translateY: offsetY }] }]}
          />
        ))}
      </View>
    </View>
  );
}

const chatIconStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function ChatFab({ recipientId }: { recipientId: string }) {
  const { theme } = useTheme();
  const { previewThemeId } = useShop();
  const [isSending, setIsSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  const openMenu = useCallback(() => {
    vibrateButtonPress();
    setMenuOpen(true);
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  }, [scaleAnim]);

  const closeMenu = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMenuOpen(false);
    });
  }, [scaleAnim]);

  const handleSelect = useCallback(
    async (type: PartnerMessageType) => {
      closeMenu();
      if (isSending) return;
      setIsSending(true);
      try {
        await sendPartnerMessage(recipientId, type);
        const { sentLabel, emoji } = PARTNER_MESSAGES[type];
        Alert.alert(`${sentLabel} ${emoji}`, 'Enviado a tu Partner.');
      } catch {
        Alert.alert('Error', 'No se pudo enviar el mensaje. Revisa la conexión.');
      } finally {
        setIsSending(false);
      }
    },
    [closeMenu, isSending, recipientId],
  );

  return (
    <View
      style={[styles.wrapper, previewThemeId ? styles.wrapperWithPreview : null]}
      pointerEvents="box-none"
    >
      {menuOpen && (
        <Pressable style={styles.backdrop} onPress={closeMenu} accessibilityRole="button" />
      )}

      {menuOpen &&
        MENU_ITEMS.map((type, index) => {
          const { x, y } = satelliteOffset(MENU_ANGLES[index]);
          const { emoji } = PARTNER_MESSAGES[type];

          return (
            <Animated.View
              key={type}
              style={[
                styles.satelliteWrap,
                {
                  transform: [
                    { translateX: x },
                    { translateY: y },
                    { scale: scaleAnim },
                  ],
                  opacity: scaleAnim,
                },
              ]}
            >
              <Pressable
                onPress={() => handleSelect(type)}
                disabled={isSending}
                style={({ pressed }) => [
                  styles.satellite,
                  {
                    backgroundColor: theme.glass,
                    borderColor: theme.glassBorder,
                    opacity: pressed || isSending ? 0.7 : 1,
                  },
                ]}
                accessibilityLabel={PARTNER_MESSAGES[type].message}
              >
                <Text style={styles.satelliteEmoji}>{emoji}</Text>
              </Pressable>
            </Animated.View>
          );
        })}

      <Pressable
        onLongPress={openMenu}
        delayLongPress={280}
        disabled={isSending}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.primary,
            borderColor: theme.glassBorder,
            opacity: pressed || isSending ? 0.75 : 1,
          },
        ]}
        accessibilityLabel="Mantener presionado para enviar mensajes"
        accessibilityHint="Abre opciones de beso, ánimo y más"
      >
        <AnimatedChatIcon bubbleColor="#fff" dotColor={theme.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 82,
    alignSelf: 'center',
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  wrapperWithPreview: {
    bottom: 150,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    top: -800,
    bottom: -120,
    left: -200,
    right: -200,
    zIndex: -1,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  satelliteWrap: {
    position: 'absolute',
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  satellite: {
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    borderRadius: SATELLITE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  satelliteEmoji: {
    fontSize: 24,
  },
});
