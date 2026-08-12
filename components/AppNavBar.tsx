import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { HapticPressable } from './HapticPressable';
import { useTheme } from '../context/ThemeContext';

interface AppNavBarProps {
  onBack: () => void;
  backLabel?: string;
  trailing?: React.ReactNode;
}

export function AppNavBar({ onBack, backLabel = 'Volver', trailing }: AppNavBarProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[theme.primary, theme.accent, theme.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.border}
      >
        <View style={styles.inner}>
          <BlurView intensity={40} tint={theme.blurTint} style={styles.blur}>
            <View
              style={[
                styles.content,
                {
                  backgroundColor:
                    theme.blurTint === 'light' ? 'rgba(255,255,255,0.5)' : 'rgba(8,8,14,0.5)',
                },
              ]}
            >
              <HapticPressable accessibilityLabel={backLabel} accessibilityRole="button" onPress={onBack} style={styles.backButton}>
                <Ionicons name="chevron-back" size={18} color={theme.text} />
                <Text style={[styles.back, { color: theme.text }]}>{backLabel}</Text>
              </HapticPressable>
              {trailing}
            </View>
          </BlurView>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    borderRadius: 18,
  },
  border: {
    borderRadius: 18,
    padding: 1.5,
  },
  inner: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {
    fontSize: 15,
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
});
