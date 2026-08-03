import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import {
  getBlockedUsersPage, getCirclePage, getDiscoveryPage, getGraphSummary, getOwnProfile, getPublicProfile, getRequestPage, GraphCommand, GraphSummary,
  OwnProfile, OwnProfileSave, PublicProfile, runGraphCommand, saveOwnProfile, searchProfiles, subscribeToSocialGraphChanges,
} from '../services/socialGraph';
import { createWorkoutRecap, deleteWorkoutRecap, getWorkoutRecapDetail, getWorkoutRecapPage, recapInputFromSession, recapSharePayload, subscribeToWorkoutRecapChanges } from '../services/workoutRecapFeed';
import { attemptToSession } from '../utils/workoutAttempts';
import { getCommunityActivities, subscribeToCommunityActivityChanges } from '../services/experience';
import {
  acceptPrivatePlanShareRequest,
  createPrivatePlanShareRequest,
  getProfilePlanLibrary,
  listReceivedPrivatePlanShareRequests,
  rejectPrivatePlanShareRequest,
} from '../services/privatePlanSharing';
import { subscribeToJointWorkoutChanges } from '../services/jointWorkouts';

type SocialContextValue = {
  ownProfile: OwnProfile | null;
  refreshOwnProfile: () => Promise<void>;
  saveProfile: (profile: OwnProfileSave) => Promise<void>;
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
  getCommunityActivities: typeof getCommunityActivities;
  createWorkoutRecap: typeof createWorkoutRecap;
  deleteWorkoutRecap: typeof deleteWorkoutRecap;
  failedAutoRecapSessionIds: ReadonlySet<string>;
  clearFailedAutoRecapSession: (sessionId: string) => void;
  getProfilePlanLibrary: typeof getProfilePlanLibrary;
  createPrivatePlanShareRequest: typeof createPrivatePlanShareRequest;
  listReceivedPrivatePlanShareRequests: typeof listReceivedPrivatePlanShareRequests;
  acceptPrivatePlanShareRequest: typeof acceptPrivatePlanShareRequest;
  rejectPrivatePlanShareRequest: typeof rejectPrivatePlanShareRequest;
  realtimeRevision: number;
};

const SocialContext = createContext<SocialContextValue | null>(null);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { attempts, routines, mesocycles } = useData();
  const [ownProfile, setOwnProfile] = useState<OwnProfile | null>(null);
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const [failedAutoRecapSessionIds, setFailedAutoRecapSessionIds] = useState<ReadonlySet<string>>(new Set());
  const autoPublishingKeys = useRef(new Set<string>());
  const [recapRetryRevision, setRecapRetryRevision] = useState(0);
  const refreshOwnProfile = useCallback(async () => setOwnProfile(await getOwnProfile()), []);
  const clearFailedAutoRecapSession = useCallback((sessionId: string) => setFailedAutoRecapSessionIds((current) => {
    if (!current.has(sessionId)) return current;
    const next = new Set(current); next.delete(sessionId); return next;
  }), []);
  const saveProfile = useCallback(async (profile: OwnProfileSave) => {
    await saveOwnProfile(profile);
    await refreshOwnProfile();
  }, [refreshOwnProfile]);
  useEffect(() => {
    let mounted = true;
    let unsubscribeGraph: () => void = () => undefined;
    let unsubscribeRecaps: () => void = () => undefined;
    let unsubscribeActivities: () => void = () => undefined;
    let unsubscribeJointWorkouts: () => void = () => undefined;
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
    void subscribeToCommunityActivityChanges(invalidate).then((cleanup) => {
      if (mounted) unsubscribeActivities = cleanup;
      else cleanup();
    }).catch(() => undefined);
    void subscribeToJointWorkoutChanges(invalidate).then((cleanup) => {
      if (mounted) unsubscribeJointWorkouts = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => { mounted = false; unsubscribeGraph(); unsubscribeRecaps(); unsubscribeActivities(); unsubscribeJointWorkouts(); };
  }, [user, refreshOwnProfile]);
  useEffect(() => {
    if (!ownProfile?.autoShareCompletedWorkouts) return;
    for (const attempt of attempts) {
      if (attempt.jointWorkoutId || !attempt.recapPublicationKey || autoPublishingKeys.current.has(attempt.recapPublicationKey)) continue;
      autoPublishingKeys.current.add(attempt.recapPublicationKey);
      const session = attemptToSession(attempt);
      const publicationKey = session.recapPublicationKey;
      if (!publicationKey) continue;
      const input = recapInputFromSession(session);
      input.sharePayload = recapSharePayload(session, routines.find(({ id }) => id === session.routineId), session.lineage ? mesocycles.find(({ id }) => id === session.lineage?.mesocycleId) : undefined, routines, ownProfile);
      void createWorkoutRecap(input, publicationKey).then(() => []).catch(() => [session.id]).then((failedSessionIds) => setFailedAutoRecapSessionIds((current) => {
        const next = new Set(current);
        if (failedSessionIds.length) next.add(session.id);
        else next.delete(session.id);
        return next;
      })).finally(() => autoPublishingKeys.current.delete(publicationKey));
    }
  }, [attempts, createWorkoutRecap, mesocycles, ownProfile, recapRetryRevision, routines]);
  useEffect(() => {
    if (!ownProfile?.autoShareCompletedWorkouts || failedAutoRecapSessionIds.size === 0) return undefined;
    const retry = setTimeout(() => setRecapRetryRevision((revision) => revision + 1), 30_000);
    return () => clearTimeout(retry);
  }, [failedAutoRecapSessionIds, ownProfile?.autoShareCompletedWorkouts]);
  const value = useMemo(() => ({ ownProfile, refreshOwnProfile, saveProfile, discover: getDiscoveryPage, search: searchProfiles, circle: getCirclePage, requests: getRequestPage, blockedUsers: getBlockedUsersPage, getProfile: getPublicProfile, getSummary: getGraphSummary, command: runGraphCommand, getWorkoutRecaps: getWorkoutRecapPage, getWorkoutRecapDetail, getCommunityActivities, createWorkoutRecap, deleteWorkoutRecap, failedAutoRecapSessionIds, clearFailedAutoRecapSession, getProfilePlanLibrary, createPrivatePlanShareRequest, listReceivedPrivatePlanShareRequests, acceptPrivatePlanShareRequest, rejectPrivatePlanShareRequest, realtimeRevision }), [ownProfile, realtimeRevision, refreshOwnProfile, saveProfile, failedAutoRecapSessionIds, clearFailedAutoRecapSession]);
  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) throw new Error('useSocial must be used within SocialProvider');
  return context;
}
