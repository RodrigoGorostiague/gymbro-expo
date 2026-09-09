import React from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeBackground, GlassCard } from '../../components/GlassCard';
import { AppNavBar } from '../../components/AppNavBar';
import { SensorySettings } from '../../components/SensorySettings';
export default function TrainingPreferencesScreen() {
    return <ThemeBackground><SafeAreaView style={{ flex: 1, paddingHorizontal: 20 }}><AppNavBar onBack={() => router.back()}/><ScrollView contentContainerStyle={{ paddingVertical: 20 }}><GlassCard blur={false}><SensorySettings /></GlassCard></ScrollView></SafeAreaView></ThemeBackground>;
}
