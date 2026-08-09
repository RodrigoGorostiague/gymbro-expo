import React, { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

export default function JointParticipantPublicationScreen() {
  const { workoutId, participantId } = useLocalSearchParams<{ workoutId: string; participantId: string }>();

  useEffect(() => {
    router.replace({
      pathname: '/social/recap/[id]',
      params: {
        id: `joint:${workoutId}:${participantId}`,
        workoutId,
        participantId,
      },
    });
  }, [participantId, workoutId]);

  return null;
}
