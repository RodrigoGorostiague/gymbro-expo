import { Tabs, Redirect } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ThemePreviewBar } from '../../components/ThemePreviewBar';
import { ChatFab } from '../../components/ChatFab';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

type TabIconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  focused,
}: {
  name: TabIconName;
  focused: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.iconWrap}>
      {focused && (
        <LinearGradient
          colors={[theme.primary, theme.accent]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.activePill}
        />
      )}
      <Ionicons
        name={name}
        size={22}
        color={focused ? theme.primary : theme.textMuted}
      />
    </View>
  );
}

function TabBarBackground() {
  const { theme } = useTheme();

  return (
    <View style={StyleSheet.absoluteFill}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={70} tint={theme.blurTint} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.tabBarBackground }]} />
      )}
      <LinearGradient
        colors={[theme.primary, theme.accent, theme.primary]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.tabBarGlow}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  const { theme } = useTheme();

  if (isLoading) return null;
  if (!user) return <Redirect href="/" />;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarBackground: () => <TabBarBackground />,
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            height: 68,
            paddingTop: 6,
            paddingBottom: 10,
            elevation: 0,
          },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 0.3,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="routines/index"
          options={{
            title: 'Rutinas',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'layers' : 'layers-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="exercises/index"
          options={{
            title: 'Ejercicios',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'barbell' : 'barbell-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progreso',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'analytics' : 'analytics-outline'}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="shop"
          options={{
            title: 'Tienda',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'storefront' : 'storefront-outline'} focused={focused} />
            ),
          }}
        />
      </Tabs>
      <ChatFab />
      <ThemePreviewBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBarGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.85,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 28,
  },
  activePill: {
    position: 'absolute',
    top: -4,
    width: 22,
    height: 3,
    borderRadius: 2,
  },
});
