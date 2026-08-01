import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import {
  getBlockedUsersPage, getCirclePage, getDiscoveryPage, getGraphSummary, getOwnProfile, getPublicProfile, getRequestPage, GraphCommand, GraphSummary,
  OwnProfile, PublicProfile, runGraphCommand, saveOwnProfile, searchProfiles, subscribeToSocialGraphChanges,
} from '../services/socialGraph';
import { createWorkoutRecap, deleteWorkoutRecap, getWorkoutRecapDetail, getWorkoutRecapPage, publishAutomaticWorkoutRecaps, subscribeToWorkoutRecapChanges } from '../services/workoutRecapFeed';
import { attemptToSession } from '../utils/workoutAttempts';

type SocialContextValue = {
  ownProfile: OwnProfile | null;
  refreshOwnProfile: () => Promise<void>;
  saveProfile: (profile: Omit<OwnProfile, 'uid'>) => Promise<void>;
  discover: typeof getDiscoveryPage;
  search: typeof searchProfiles;
  circle: typeof getCirclePage;
  requests: typeof getRequestPage;
  blockedUsers: typeof getBlockedUsersPage;
  getProfile: (uid: string) => Promise<PublicProfile | null>;
  getSummary: (uid: string) => Promise<GraphSummary>;
  command: (command: GraphCommand) => Promise<GraphSummary>;
  getWorkoutRecaps: typeof getWorkoutRecapPage;
  getWorkoutRecapDetail: typeof getWorkoutRecapDetail;
  createWorkoutRecap: typeof createWorkoutRecap;
  deleteWorkoutRecap: typeof deleteWorkoutRecap;
  failedAutoRecapSessionIds: ReadonlySet<string>;
  clearFailedAutoRecapSession: (sessionId: string) => void;
  realtimeRevision: number;
};

const SocialContext = createContext<SocialContextValue | null>(null);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { attempts } = useData();
  const [ownProfile, setOwnProfile] = useState<OwnProfile | null>(null);
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const [failedAutoRecapSessionIds, setFailedAutoRecapSessionIds] = useState<ReadonlySet<string>>(new Set());
  const autoPublishingKeys = useRef(new Set<string>());
  const refreshOwnProfile = useCallback(async () => setOwnProfile(await getOwnProfile()), []);
  const clearFailedAutoRecapSession = useCallback((sessionId: string) => setFailedAutoRecapSessionIds((current) => {
    if (!current.has(sessionId)) return current;
    const next = new Set(current); next.delete(sessionId); return next;
  }), []);
  const saveProfile = useCallback(async (profile: Omit<OwnProfile, 'uid'>) => {
    await saveOwnProfile(profile);
    await refreshOwnProfile();
  }, [refreshOwnProfile]);
  useEffect(() => {
    let mounted = true;
    let unsubscribeGraph: () => void = () => undefined;
    let unsubscribeRecaps: () => void = () => undefined;
    if (!user) {
      setOwnProfile(null);
      return undefined;
    }
    void refreshOwnProfile().catch(() => undefined);
    const invalidate = () => {
      if (mounted) setRealtimeRevision((revision) => revision + 1);
    };
    void subscribeToSocialGraphChanges(invalidate).then((cleanup) => {
      if (mounted) unsubscribeGraph = cleanup;
      else cleanup();
    }).catch(() => undefined);
    void subscribeToWorkoutRecapChanges(invalidate).then((cleanup) => {
      if (mounted) unsubscribeRecaps = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => { mounted = false; unsubscribeGraph(); unsubscribeRecaps(); };
  }, [user, refreshOwnProfile]);
  useEffect(() => {
    if (!ownProfile?.autoShareCompletedWorkouts) return;
    for (const attempt of attempts) {
      if (!attempt.recapPublicationKey || autoPublishingKeys.current.has(attempt.recapPublicationKey)) continue;
      autoPublishingKeys.current.add(attempt.recapPublicationKey);
      const session = attemptToSession(attempt);
      void publishAutomaticWorkoutRecaps([session], true).then((failedSessionIds) => setFailedAutoRecapSessionIds((current) => {
        const next = new Set(current);
        if (failedSessionIds.length) next.add(session.id);
        else next.delete(session.id);
        return next;
      }));
    }
  }, [attempts, ownProfile?.autoShareCompletedWorkouts]);
  const value = useMemo(() => ({ ownProfile, refreshOwnProfile, saveProfile, discover: getDiscoveryPage, search: searchProfiles, circle: getCirclePage, requests: getRequestPage, blockedUsers: getBlockedUsersPage, getProfile: getPublicProfile, getSummary: getGraphSummary, command: runGraphCommand, getWorkoutRecaps: getWorkoutRecapPage, getWorkoutRecapDetail, createWorkoutRecap, deleteWorkoutRecap, failedAutoRecapSessionIds, clearFailedAutoRecapSession, realtimeRevision }), [ownProfile, realtimeRevision, refreshOwnProfile, saveProfile, failedAutoRecapSessionIds, clearFailedAutoRecapSession]);
  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) throw new Error('useSocial must be used within SocialProvider');
  return context;
}
