import {
    JOB_PHASES,
    JOB_STATES,
    TERMINAL_JOB_STATES,
    createMediaJob,
    transitionJob,
} from './models.js';

const initialState = () => ({ version: 1, jobs: [] });
const iso = (value = Date.now()) => new Date(value).toISOString();
const sortJobs = (jobs) => jobs.sort((a, b) => (
    Number(b.priority || 0) - Number(a.priority || 0)
    || String(a.createdAt).localeCompare(String(b.createdAt))
));

export const createDurableJobQueue = ({ store, clock = () => Date.now() } = {}) => {
    if (!store?.read || !store?.update) throw new Error('[media-automation/queue] store is required');

    const normalize = (state) => ({
        ...initialState(),
        ...(state && typeof state === 'object' ? state : {}),
        jobs: Array.isArray(state?.jobs) ? state.jobs.map((job) => ({
            ...job,
            lane: job.lane === 'gpu' ? 'gpu' : 'cpu',
            fingerprint: job.fingerprint || null,
            phase: job.phase || (job.state === JOB_STATES.RUNNING ? JOB_PHASES.STARTING : job.state),
            progress: {
                percent: 0,
                outTimeUs: 0,
                etaSeconds: null,
                speed: null,
                fps: null,
                ...(job.progress || {}),
            },
        })) : [],
    });

    const list = async ({ states } = {}) => {
        const jobs = normalize(await store.read()).jobs;
        const allowed = states ? new Set(states) : null;
        return jobs.filter((job) => !allowed || allowed.has(job.state));
    };

    const get = async (id) => (await list()).find((job) => job.id === String(id)) || null;

    const enqueue = async (input) => {
        let selected;
        await store.update((raw) => {
            const state = normalize(raw);
            const key = String(input?.dedupeKey || input?.sourcePath || '');
            const fingerprint = String(input?.fingerprint || '').trim() || null;
            const sourcePath = String(input?.sourcePath || '').trim();
            const pipelineId = String(input?.pipelineId || '');
            const existing = state.jobs.find((job) => {
                if (TERMINAL_JOB_STATES.includes(job.state)) return false;
                if (key && job.dedupeKey === key) return true;
                return !!(
                    fingerprint
                    && job.fingerprint
                    && job.sourcePath === sourcePath
                    && job.fingerprint === fingerprint
                    && String(job.pipelineId || '') === pipelineId
                );
            });
            if (existing) {
                selected = existing;
                return state;
            }
            selected = createMediaJob(input, new Date(clock()));
            state.jobs.push(selected);
            return state;
        });
        return selected;
    };

    const recoverExpired = async () => {
        const now = clock();
        const recovered = [];
        await store.update((raw) => {
            const state = normalize(raw);
            state.jobs = state.jobs.map((job) => {
                if (job.state !== JOB_STATES.RUNNING || Date.parse(job.leaseExpiresAt) > now) return job;
                const retry = job.attempts < job.maxAttempts;
                const next = transitionJob(job, retry ? JOB_STATES.QUEUED : JOB_STATES.FAILED, {
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    heartbeatAt: null,
                    availableAt: iso(now),
                    error: { code: 'LEASE_EXPIRED', message: 'Worker lease expired; job recovered' },
                    finishedAt: retry ? null : iso(now),
                    phase: retry ? JOB_PHASES.QUEUED : JOB_PHASES.FAILED,
                }, new Date(now));
                recovered.push(next);
                return next;
            });
            return state;
        });
        return recovered;
    };

    const claim = async ({ workerId, leaseMs = 120_000, lane } = {}) => {
        if (!workerId) throw new Error('workerId is required');
        const now = clock();
        let claimed = null;
        await store.update((raw) => {
            const state = normalize(raw);
            const candidates = sortJobs(state.jobs.filter((job) => (
                job.state === JOB_STATES.QUEUED
                && Date.parse(job.availableAt || 0) <= now
                && !job.cancelRequested
                && (!lane || job.lane === lane)
            )));
            const job = candidates[0];
            if (!job) return state;
            claimed = transitionJob(job, JOB_STATES.RUNNING, {
                attempts: Number(job.attempts || 0) + 1,
                leaseOwner: String(workerId),
                leaseExpiresAt: iso(now + leaseMs),
                heartbeatAt: iso(now),
                startedAt: job.startedAt || iso(now),
                error: null,
                phase: JOB_PHASES.STARTING,
            }, new Date(now));
            state.jobs = state.jobs.map((entry) => entry.id === job.id ? claimed : entry);
            return state;
        });
        return claimed;
    };

    const mutateClaimed = async (id, workerId, mutator) => {
        let output = null;
        await store.update((raw) => {
            const state = normalize(raw);
            state.jobs = state.jobs.map((job) => {
                if (job.id !== String(id)) return job;
                if (job.state !== JOB_STATES.RUNNING || job.leaseOwner !== String(workerId)) {
                    throw new Error('Job lease is not owned by this worker');
                }
                output = mutator(job);
                return output;
            });
            return state;
        });
        if (!output) throw new Error(`Job not found: ${id}`);
        return output;
    };

    const heartbeat = (id, workerId, leaseMs = 120_000) => {
        const now = clock();
        return mutateClaimed(id, workerId, (job) => ({
            ...job,
            heartbeatAt: iso(now),
            leaseExpiresAt: iso(now + leaseMs),
            updatedAt: iso(now),
        }));
    };

    const updateProgress = (id, workerId, { phase, progress, plan } = {}) => {
        const now = clock();
        return mutateClaimed(id, workerId, (job) => ({
            ...job,
            phase: phase == null ? job.phase : String(phase),
            progress: progress == null ? job.progress : { ...job.progress, ...progress },
            plan: plan === undefined ? job.plan : plan,
            updatedAt: iso(now),
        }));
    };

    const complete = (id, workerId, result = {}) => {
        const now = clock();
        return mutateClaimed(id, workerId, (job) => transitionJob(job, JOB_STATES.SUCCEEDED, {
            result,
            phase: JOB_PHASES.COMPLETED,
            progress: { ...job.progress, percent: 100, etaSeconds: 0 },
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            finishedAt: iso(now),
        }, new Date(now)));
    };

    const fail = (id, workerId, error, { retryDelayMs = 60_000 } = {}) => {
        const now = clock();
        return mutateClaimed(id, workerId, (job) => {
            const retry = job.attempts < job.maxAttempts && !job.cancelRequested;
            return transitionJob(job, retry ? JOB_STATES.QUEUED : JOB_STATES.FAILED, {
                error: {
                    code: String(error?.code || 'JOB_FAILED'),
                    message: String(error?.message || error || 'Job failed'),
                },
                availableAt: iso(now + (retry ? retryDelayMs : 0)),
                leaseOwner: null,
                leaseExpiresAt: null,
                heartbeatAt: null,
                finishedAt: retry ? null : iso(now),
                phase: retry ? JOB_PHASES.QUEUED : JOB_PHASES.FAILED,
            }, new Date(now));
        });
    };

    const requestCancel = async (id) => {
        let output = null;
        await store.update((raw) => {
            const state = normalize(raw);
            state.jobs = state.jobs.map((job) => {
                if (job.id !== String(id) || TERMINAL_JOB_STATES.includes(job.state)) return job;
                const now = new Date(clock());
                output = job.state === JOB_STATES.QUEUED
                    ? transitionJob(job, JOB_STATES.CANCELLED, {
                        cancelRequested: true,
                        finishedAt: now.toISOString(),
                        phase: JOB_PHASES.CANCELLED,
                    }, now)
                    : { ...job, cancelRequested: true, updatedAt: now.toISOString() };
                return output;
            });
            return state;
        });
        return output;
    };

    const retry = async (id, { resetAttempts = false, availableAt } = {}) => {
        let output = null;
        await store.update((raw) => {
            const state = normalize(raw);
            state.jobs = state.jobs.map((job) => {
                if (job.id !== String(id)) return job;
                if (![JOB_STATES.FAILED, JOB_STATES.CANCELLED].includes(job.state)) {
                    throw new Error('Only failed or cancelled jobs can be retried');
                }
                const now = new Date(clock());
                output = transitionJob(job, JOB_STATES.QUEUED, {
                    attempts: resetAttempts ? 0 : job.attempts,
                    availableAt: availableAt || now.toISOString(),
                    cancelRequested: false,
                    error: null,
                    result: null,
                    finishedAt: null,
                    phase: JOB_PHASES.QUEUED,
                    progress: { percent: 0, outTimeUs: 0, etaSeconds: null, speed: null, fps: null },
                }, now);
                return output;
            });
            return state;
        });
        if (!output) throw new Error(`Job not found: ${id}`);
        return output;
    };

    const cancelClaimed = (id, workerId) => {
        const now = new Date(clock());
        return mutateClaimed(id, workerId, (job) => transitionJob(job, JOB_STATES.CANCELLED, {
            cancelRequested: true,
            phase: JOB_PHASES.CANCELLED,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            finishedAt: now.toISOString(),
        }, now));
    };

    const prune = async ({ olderThanMs = 30 * 86_400_000 } = {}) => {
        const cutoff = clock() - olderThanMs;
        let removed = 0;
        await store.update((raw) => {
            const state = normalize(raw);
            state.jobs = state.jobs.filter((job) => {
                const drop = TERMINAL_JOB_STATES.includes(job.state) && Date.parse(job.finishedAt || 0) < cutoff;
                if (drop) removed += 1;
                return !drop;
            });
            return state;
        });
        return removed;
    };

    return {
        list,
        get,
        enqueue,
        recoverExpired,
        claim,
        heartbeat,
        updateProgress,
        complete,
        fail,
        retry,
        requestCancel,
        cancelClaimed,
        prune,
    };
};

export default createDurableJobQueue;
