import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RoutineEditor } from '../../components/RoutineEditor';
export default function EditRoutineScreen() {
  const { id, addExerciseId } = useLocalSearchParams<{ id: string; addExerciseId?: string }>();
  return <RoutineEditor sourceId={id} addExerciseId={addExerciseId} />;
}
