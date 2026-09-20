import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { FunctionalGuidanceContext } from '../context/FunctionalGuidanceContext';
import { readGuidancePreferences, writeGuidancePreferences } from '../services/functionalGuidance';
import { GuidancePreferences, isGuidanceAttemptConfirmed, newGuidancePreferences, selectFunctionalGuidance } from '../utils/functionalGuidance';

export function FunctionalGuidanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <AccountGuidance key={user ?? 'signed-out'} owner={user}>{children}</AccountGuidance>;
}
function AccountGuidance({ owner, children }: { owner: string | null; children: React.ReactNode }) {
  const data = useData();
  const domainReady = !!owner && data.hydratedUserId === owner && data.dataState === 'ready';
  const [preferences, setPreferences] = useState(newGuidancePreferences);
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(preferences);
  const mounted = useRef(true);
  const revision = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!owner || !domainReady || loaded) return;
    let active = true;
    const request = revision.current;
    void readGuidancePreferences(owner).then(value => {
      if (active && revision.current === request) { current.current = value; setPreferences(value); setLoaded(true); }
    }).catch(() => { if (active && revision.current === request) { setLoaded(true); setReadFailed(true); } });
    return () => { active = false; };
  }, [owner, domainReady, loaded]);
  const input = {
    owner, ready: domainReady && loaded, busy: !!data.activeWorkoutDraft || !!data.offlineWorkoutEnabled
      || !!data.onlineWorkoutBlocked || ['conflict', 'blocked', 'local-error'].includes(data.offlineWorkoutStatus),
    preferences, routines: data.routines ?? [], attempts: data.attempts ?? [], sessionIds: (data.sessions ?? []).map(s => s.id),
  };
  const latest = useRef(input);
  latest.current = input;
  const update = (patch: Partial<GuidancePreferences>, explicit = true) => {
    if (!owner || !mounted.current || !latest.current.ready) return;
    const value = { ...current.current, ...patch };
    const writing = ++revision.current;
    current.current = value; setPreferences(value); setError(null);
    if (explicit) setReadFailed(false);
    void writeGuidancePreferences(owner, value).catch(() => {
      if (mounted.current && revision.current === writing && explicit) setError('No pudimos guardar tu preferencia de ayuda en este dispositivo.');
    });
  };
  const progress = selectFunctionalGuidance(input);
  if (readFailed) progress.visible = false;
  const active = input.ready && !readFailed && preferences.invitation === 'accepted' && !progress.reviewed;
  return <FunctionalGuidanceContext.Provider value={{
    ready: input.ready, active, preferences, progress, error,
    accept: () => update({ invitation: 'accepted' }),
    dismiss: () => update({ invitation: 'dismissed' }),
    dismissTopic: (id, explicit = true) => { if (!current.current.dismissedTopicIds.includes(id)) update({ dismissedTopicIds: [...current.current.dismissedTopicIds, id] }, explicit); },
    selectRoutine: id => { if (current.current.selectedRoutineId !== id && latest.current.routines.some(r => r.id === id) && current.current.invitation === 'accepted') update({ selectedRoutineId: id }, false); },
    reviewResult: id => {
      if (current.current.invitation !== 'accepted' || current.current.reviewedResultId === id) return;
      if (latest.current.sessionIds.includes(id) && latest.current.attempts.some(a => a.id === id && isGuidanceAttemptConfirmed(a, owner!, Date.now()))) update({ reviewedResultId: id }, false);
    },
    acknowledgeMesocycles: () => update({ mesocycleTopicAcknowledged: true }),
    nextAction: () => mounted.current ? selectFunctionalGuidance({ ...latest.current, preferences: current.current }).next : { type: 'blocked' },
  }}>{children}</FunctionalGuidanceContext.Provider>;
}
