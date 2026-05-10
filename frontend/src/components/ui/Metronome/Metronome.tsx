import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import SettingsIcon from "@mui/icons-material/Settings";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import type { Measure } from "../../../lib/songs";
import { useSongs } from "../../../context/SongContext";
import Button from "../Button/Button";
import DialogBox from "../DialogBox/DialogBox";
import "./Metronome.css";

function getTempoName(bpm: number) {
    if (bpm < 40) return "Grave";
    if (bpm < 60) return "Largo";
    if (bpm < 66) return "Larghetto";
    if (bpm < 76) return "Adagio";
    if (bpm < 90) return "Andante";
    if (bpm < 105) return "Moderato";
    if (bpm < 115) return "Allegretto";
    if (bpm < 130) return "Allegro";
    if (bpm < 168) return "Vivace";
    if (bpm < 200) return "Presto";
    return "Prestissimo";
}

function getTempoMarking(pulse: number): string {
    switch (pulse) {
        case 1:
            return "";
        case 2:
            return "";
        case 4:
            return "";
        case 8:
            return "";
        case 16:
            return "";
        default:
            return "";
    }
}

function getLastMetronomeBPM(
    events?: Array<{ type?: string; value?: number }>,
): number | null {
    if (!Array.isArray(events)) return null;
    for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev && ev.type === "metronome" && typeof ev.value === "number")
            return ev.value;
    }
    return null;
}

type PracticeMode = "rapid" | "speed" | "stability" | null;
const BPMMarks = [
    20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56,
    58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116,
    120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208, 216, 224,
    232, 240, 250, 260, 270, 280, 290, 300,
];

function getNextBPMMark(currentBPM: number, maxBPM: number): number {
    for (const mark of BPMMarks) {
        if (mark > currentBPM && mark <= maxBPM) return mark;
    }
    return currentBPM;
}

function getMostConservativeMode(
    selectedMeasures: Measure[] | undefined,
    measure: Measure | null | undefined,
): PracticeMode {
    if (!selectedMeasures || selectedMeasures.length === 0) {
        return measure?.mode ?? "rapid";
    }

    // Collect all modes from selected measures
    const modes = selectedMeasures
        .map((m) => m.mode)
        .filter((m) => m !== undefined && m !== null);
    if (modes.length === 0) {
        return "rapid";
    }

    // Order: stability (most conservative) > speed > rapid (least conservative)
    if (modes.includes("stability")) return "stability";
    if (modes.includes("speed")) return "speed";
    if (modes.includes("rapid")) return "rapid";

    return "rapid";
}

function getPreviousBPMMark(currentBPM: number, minBPM: number): number {
    for (let i = BPMMarks.length - 1; i >= 0; i--) {
        const mark = BPMMarks[i];
        if (mark < currentBPM && mark >= minBPM) return mark;
    }
    return Math.max(minBPM, currentBPM);
}

interface MetronomeProps {
    isPlaying: boolean;
    setIsPlaying: (p: boolean) => void;
    isFreeMode?: boolean;
    targetTempo?: number;
    measure?: Measure | null;
    selectedMeasures?: Measure[];
    songId?: string | null;
    onPracticeEvent?: (
        outcome: "success" | "failure",
        bpm: number,
        elapsedSeconds: number,
    ) => Promise<void>;
}

export default function Metronome({
    isPlaying,
    setIsPlaying,
    isFreeMode = true,
    targetTempo = 120,
    measure = null,
    selectedMeasures = [],
    songId = null,
    onPracticeEvent,
}: MetronomeProps) {
    const practiceScopeKey = useMemo(() => {
        if (isFreeMode || !songId) {
            return null;
        }

        const selectedMeasureNumbers = Array.isArray(selectedMeasures)
            ? selectedMeasures
                  .map((m) => Number(m?.number))
                  .filter((n) => Number.isInteger(n) && n > 0)
                  .sort((a, b) => a - b)
            : [];

        if (selectedMeasureNumbers.length > 0) {
            return `selected:${selectedMeasureNumbers.join(",")}`;
        }

        const measureNumber = Number(measure?.number);
        if (Number.isInteger(measureNumber) && measureNumber > 0) {
            return `measure:${measureNumber}`;
        }

        return "song";
    }, [isFreeMode, songId, selectedMeasures, measure]);

    const practiceStreakStorageKey = useMemo(() => {
        if (!songId || !practiceScopeKey) {
            return null;
        }

        return `practice-streak:${songId}:${practiceScopeKey}`;
    }, [songId, practiceScopeKey]);

    const [currentPulse, setCurrentPulse] = useState(4); // always default to quarter on mount

    const initialTempo = useMemo(() => {
        if (isFreeMode) {
            const savedQuarter = localStorage.getItem("practice-free-bpm");
            const quarter = savedQuarter ? parseInt(savedQuarter, 10) : null;
            if (Number.isInteger(quarter) && quarter > 0) {
                // Convert stored quarter-note BPM to displayed BPM for current pulse
                return Math.max(20, Math.round(quarter * (currentPulse / 4)));
            }
            return 120;
        }

        // Check if any selected measure has no events (fresh measures)
        const anyFresh =
            Array.isArray(selectedMeasures) && selectedMeasures.length > 0
                ? selectedMeasures.some(
                      (m) => !Array.isArray(m.events) || m.events.length === 0,
                  )
                : !Array.isArray(measure?.events) ||
                  measure!.events!.length === 0;

        if (anyFresh) {
            // If any measure is fresh, start at target / 4
            return Math.max(
                20,
                Math.floor((measure?.target ?? targetTempo) / 4),
            );
        }

        // Otherwise, try to get last metronome BPM from first selected measure (or active measure)
        const last = getLastMetronomeBPM(measure?.events);
        return (
            last ??
            Math.max(20, Math.floor((measure?.target ?? targetTempo) / 4))
        );
    }, [isFreeMode, measure, selectedMeasures, targetTempo]);

    const [currentBPM, setCurrentBPM] = useState<number>(initialTempo);
    const [showBPM, setShowBPM] = useState(true);
    const [practiceMode, setPracticeMode] = useState<PracticeMode>(
        getMostConservativeMode(selectedMeasures, measure),
    );
    const [showSettingsDialog, setShowSettingsDialog] = useState(false);
    const [streak, setStreak] = useState(0);
    const [errorStreak, setErrorStreak] = useState(0);
    const [tempoFeedback, setTempoFeedback] = useState<
        "success" | "failure" | null
    >(null);
    const [isLogging, setIsLogging] = useState(false);
    const [beatFlash, setBeatFlash] = useState(false);
    const [tapMode, setTapMode] = useState(false);
    const [practiceClockSeconds, setPracticeClockSeconds] = useState(0);
    // currentPulse state initialized above to read persisted value
    const audioContextRef = useRef<AudioContext | null>(null);
    const schedulerIntervalRef = useRef<number | null>(null);
    const clockIntervalRef = useRef<number | null>(null);
    const practiceSessionStartRef = useRef<number | null>(null);
    const lastPracticeLogRef = useRef<number | null>(null);
    const nextBeatTimeRef = useRef(0);
    const visualTimeoutIdsRef = useRef<number[]>([]);
    const tapTimesRef = useRef<number[]>([]);
    const tapTimeoutRef = useRef<number | null>(null);
    const tapModeTimeoutRef = useRef<number | null>(null);
    const isDraggingTempoRef = useRef(false);
    const hasDraggedTempoRef = useRef(false);
    const dragStartYRef = useRef(0);
    const suppressTempoCircleClickRef = useRef(false);
    const incHoldTimeoutRef = useRef<number | null>(null);
    const incHoldIntervalRef = useRef<number | null>(null);
    const decHoldTimeoutRef = useRef<number | null>(null);
    const decHoldIntervalRef = useRef<number | null>(null);
    const suppressDecClickRef = useRef(false);
    const suppressIncClickRef = useRef(false);
    const beatDurationRef = useRef<number>(60 / initialTempo);
    const hasInitializedFromMeasureRef = useRef<string | null>(null);
    const practiceClockSecondsRef = useRef(0);

    const tempoName = getTempoName(currentBPM);

    const thresholds = useMemo(
        () => ({
            rapid: { success: 1, failure: 1 },
            speed: { success: 3, failure: 2 },
            stability: { success: 7, failure: 3 },
        }),
        [],
    );

    useEffect(() => {
        if (isFreeMode) {
            try {
                // Persist as quarter-note BPM (rounded)
                const quarter = Math.round(currentBPM * (4 / currentPulse));
                localStorage.setItem("practice-free-bpm", String(quarter));
            } catch {
                // ignore storage failures
            }
        }
    }, [isFreeMode, currentBPM, currentPulse]);

    useEffect(() => {
        let nextStreak = 0;
        let nextErrorStreak = 0;

        if (!practiceStreakStorageKey || !practiceMode) {
            queueMicrotask(() => {
                setStreak(nextStreak);
                setErrorStreak(nextErrorStreak);
            });
            return;
        }

        try {
            const raw = localStorage.getItem(practiceStreakStorageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                const successStreak = Number(parsed?.successStreak);
                const failureStreak = Number(parsed?.failureStreak);
                const storedMode = parsed?.mode;

                if (storedMode === practiceMode) {
                    nextStreak =
                        Number.isInteger(successStreak) && successStreak > 0
                            ? successStreak
                            : 0;
                    nextErrorStreak =
                        Number.isInteger(failureStreak) && failureStreak > 0
                            ? failureStreak
                            : 0;
                }
            }
        } catch {
            nextStreak = 0;
            nextErrorStreak = 0;
        }

        queueMicrotask(() => {
            setStreak(nextStreak);
            setErrorStreak(nextErrorStreak);
        });
    }, [practiceStreakStorageKey, practiceMode]);

    useEffect(() => {
        if (!practiceStreakStorageKey) {
            return;
        }

        try {
            if (!practiceMode) {
                localStorage.removeItem(practiceStreakStorageKey);
                return;
            }

            localStorage.setItem(
                practiceStreakStorageKey,
                JSON.stringify({
                    mode: practiceMode,
                    successStreak: streak,
                    failureStreak: errorStreak,
                }),
            );
        } catch {
            // ignore storage failures
        }
    }, [practiceStreakStorageKey, practiceMode, streak, errorStreak]);

    useEffect(() => {
        practiceClockSecondsRef.current = practiceClockSeconds;
    }, [practiceClockSeconds]);

    // When measure data arrives after initial load, sync the BPM from the last logged value
    useEffect(() => {
        if (
            !isFreeMode &&
            measure &&
            Array.isArray(measure.events) &&
            measure.events.length > 0
        ) {
            // Use a key to track if this is a new measure
            const measureKey = `${measure.number}`;
            const lastInitializedKey = hasInitializedFromMeasureRef.current;

            if (measureKey !== lastInitializedKey) {
                const lastBpm = getLastMetronomeBPM(measure.events);
                if (lastBpm !== null) {
                    // Use a microtask to defer state update and avoid cascading renders
                    queueMicrotask(() => {
                        setCurrentBPM(lastBpm);
                    });
                    hasInitializedFromMeasureRef.current = measureKey;
                }
            }
        }
    }, [measure, isFreeMode, currentPulse]);

    useEffect(() => {
        beatDurationRef.current = 60 / currentBPM;
    }, [currentBPM]);

    const clearVisualTimeouts = useCallback(() => {
        for (const id of visualTimeoutIdsRef.current) {
            window.clearTimeout(id);
        }
        visualTimeoutIdsRef.current = [];
    }, []);

    const clearTapTimers = useCallback(() => {
        if (tapTimeoutRef.current !== null) {
            window.clearTimeout(tapTimeoutRef.current);
            tapTimeoutRef.current = null;
        }
        if (tapModeTimeoutRef.current !== null) {
            window.clearTimeout(tapModeTimeoutRef.current);
            tapModeTimeoutRef.current = null;
        }
    }, []);

    const clearHoldTimers = useCallback(() => {
        if (incHoldTimeoutRef.current !== null) {
            window.clearTimeout(incHoldTimeoutRef.current);
            incHoldTimeoutRef.current = null;
        }
        if (incHoldIntervalRef.current !== null) {
            window.clearInterval(incHoldIntervalRef.current);
            incHoldIntervalRef.current = null;
        }
        if (decHoldTimeoutRef.current !== null) {
            window.clearTimeout(decHoldTimeoutRef.current);
            decHoldTimeoutRef.current = null;
        }
        if (decHoldIntervalRef.current !== null) {
            window.clearInterval(decHoldIntervalRef.current);
            decHoldIntervalRef.current = null;
        }
    }, []);

    const formatClock = useCallback((seconds: number) => {
        const safeSeconds = Math.max(0, Math.floor(seconds));
        const minutes = Math.floor(safeSeconds / 60);
        const remainder = safeSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    }, []);

    const stopScheduler = useCallback(() => {
        if (schedulerIntervalRef.current !== null) {
            window.clearInterval(schedulerIntervalRef.current);
            schedulerIntervalRef.current = null;
        }
    }, []);

    const ensureAudioContext = useCallback(async (): Promise<AudioContext> => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (
                window.AudioContext ||
                (window as unknown as Record<string, typeof AudioContext>)
                    .webkitAudioContext
            )();
        }

        if (audioContextRef.current.state === "suspended") {
            await audioContextRef.current.resume();
        }

        return audioContextRef.current;
    }, []);

    const scheduleBeat = useCallback(
        (audioContext: AudioContext, beatTime: number) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = "sine";

            gainNode.gain.setValueAtTime(1.5, beatTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, beatTime + 0.12);

            oscillator.start(beatTime);
            oscillator.stop(beatTime + 0.12);

            const flashDelay = Math.max(
                0,
                (beatTime - audioContext.currentTime) * 1000,
            );
            const flashTimer = window.setTimeout(() => {
                setBeatFlash(true);
                const clearTimer = window.setTimeout(() => {
                    setBeatFlash(false);
                }, 120);
                visualTimeoutIdsRef.current.push(clearTimer);
            }, flashDelay);

            visualTimeoutIdsRef.current.push(flashTimer);
        },
        [],
    );

    const applyDecreaseStep = useCallback(() => {
        if (practiceMode && currentPulse > 1) {
            const newPulse = currentPulse / 2;
            setCurrentPulse(newPulse);
            setCurrentBPM((b) => Math.max(20, Math.floor(b / 2)));
            return;
        }

        if (!practiceMode) {
            setCurrentBPM((b) => Math.max(20, b - 1));
        }
    }, [practiceMode, currentPulse, targetTempo]);

    const applyIncreaseStep = useCallback(() => {
        if (practiceMode && currentPulse < 16) {
            const newPulse = currentPulse * 2;
            setCurrentPulse(newPulse);
            setCurrentBPM((b) => Math.min(300, Math.floor(b * 2)));
            return;
        }

        if (!practiceMode) {
            setCurrentBPM((b) => Math.min(300, b + 1));
        }
    }, [practiceMode, currentPulse, targetTempo]);

    const applyDecreaseBPM = useCallback(() => {
        setCurrentBPM((b) => Math.max(20, b - 1));
    }, []);

    const applyIncreaseBPM = useCallback(() => {
        setCurrentBPM((b) => Math.min(300, b + 1));
    }, []);

    const startTapMode = useCallback(() => {
        setTapMode(true);

        if (tapModeTimeoutRef.current !== null) {
            window.clearTimeout(tapModeTimeoutRef.current);
        }

        tapModeTimeoutRef.current = window.setTimeout(() => {
            setTapMode(false);
            tapTimesRef.current = [];
        }, 2000);
    }, []);

    const getElapsedPracticeSeconds = useCallback(() => {
        const marker =
            lastPracticeLogRef.current ?? practiceSessionStartRef.current;
        if (marker === null) {
            return 0;
        }

        return Math.max(0, Math.ceil((Date.now() - marker) / 1000));
    }, []);

    const registerTap = useCallback(() => {
        const now = Date.now();
        tapTimesRef.current.push(now);

        if (tapTimesRef.current.length > 5) {
            tapTimesRef.current.shift();
        }

        if (tapTimeoutRef.current !== null) {
            window.clearTimeout(tapTimeoutRef.current);
        }

        tapTimeoutRef.current = window.setTimeout(() => {
            tapTimesRef.current = [];
        }, 5000);

        if (tapTimesRef.current.length >= 2) {
            const intervals: number[] = [];
            for (let i = 1; i < tapTimesRef.current.length; i++) {
                intervals.push(
                    tapTimesRef.current[i] - tapTimesRef.current[i - 1],
                );
            }

            const avgInterval =
                intervals.reduce((sum, value) => sum + value, 0) /
                intervals.length;
            const avgBpm = Math.round(60000 / avgInterval);
            setCurrentBPM(Math.max(20, avgBpm));
        }

        startTapMode();
    }, [startTapMode]);

    const startHoldIncrease = useCallback(() => {
        applyIncreaseStep();
        suppressIncClickRef.current = true;

        if (incHoldTimeoutRef.current !== null) {
            window.clearTimeout(incHoldTimeoutRef.current);
        }
        if (incHoldIntervalRef.current !== null) {
            window.clearInterval(incHoldIntervalRef.current);
        }

        incHoldTimeoutRef.current = window.setTimeout(() => {
            incHoldIntervalRef.current = window.setInterval(() => {
                applyIncreaseStep();
            }, 150);
        }, 400);
    }, [applyIncreaseStep]);

    const startHoldDecrease = useCallback(() => {
        applyDecreaseStep();
        suppressDecClickRef.current = true;

        if (decHoldTimeoutRef.current !== null) {
            window.clearTimeout(decHoldTimeoutRef.current);
        }
        if (decHoldIntervalRef.current !== null) {
            window.clearInterval(decHoldIntervalRef.current);
        }

        decHoldTimeoutRef.current = window.setTimeout(() => {
            decHoldIntervalRef.current = window.setInterval(() => {
                applyDecreaseStep();
            }, 150);
        }, 400);
    }, [applyDecreaseStep]);

    const startHoldDecreaseBPM = useCallback(() => {
        applyDecreaseBPM();
        suppressDecClickRef.current = true;

        if (decHoldTimeoutRef.current !== null) {
            window.clearTimeout(decHoldTimeoutRef.current);
        }
        if (decHoldIntervalRef.current !== null) {
            window.clearInterval(decHoldIntervalRef.current);
        }

        decHoldTimeoutRef.current = window.setTimeout(() => {
            decHoldIntervalRef.current = window.setInterval(() => {
                applyDecreaseBPM();
            }, 150);
        }, 400);
    }, [applyDecreaseBPM]);

    const startHoldIncreaseBPM = useCallback(() => {
        applyIncreaseBPM();
        suppressIncClickRef.current = true;

        if (incHoldTimeoutRef.current !== null) {
            window.clearTimeout(incHoldTimeoutRef.current);
        }
        if (incHoldIntervalRef.current !== null) {
            window.clearInterval(incHoldIntervalRef.current);
        }

        incHoldTimeoutRef.current = window.setTimeout(() => {
            incHoldIntervalRef.current = window.setInterval(() => {
                applyIncreaseBPM();
            }, 150);
        }, 400);
    }, [applyIncreaseBPM]);

    useEffect(() => {
        stopScheduler();
        clearVisualTimeouts();

        if (clockIntervalRef.current !== null) {
            window.clearInterval(clockIntervalRef.current);
            clockIntervalRef.current = null;
        }

        if (isPlaying) {
            const now = Date.now();

            // If resuming from pause, continue counting from where we left off
            // Otherwise, start fresh
            if (practiceClockSecondsRef.current > 0) {
                // Resuming from pause - adjust start ref so clock continues
                practiceSessionStartRef.current =
                    now - practiceClockSecondsRef.current * 1000;
            } else {
                // Starting fresh
                practiceSessionStartRef.current = now;
            }

            lastPracticeLogRef.current = now;

            clockIntervalRef.current = window.setInterval(() => {
                if (practiceSessionStartRef.current === null) {
                    return;
                }

                setPracticeClockSeconds(
                    Math.floor(
                        (Date.now() - practiceSessionStartRef.current) / 1000,
                    ),
                );
            }, 1000);
        } else {
            // When paused, stop the clock interval but preserve the clock value and refs
            // The clock will retain its current value and refs remain set for potential resume
        }

        if (!isPlaying) return;

        let canceled = false;
        void (async () => {
            try {
                const audioContext = await ensureAudioContext();
                if (canceled) return;

                // Seed the scheduler just inside the lookahead window so the
                // first beat is actually enqueued before the interval ticks.
                nextBeatTimeRef.current = audioContext.currentTime + 0.05;

                const scheduleWindow = () => {
                    while (
                        nextBeatTimeRef.current <
                        audioContext.currentTime + 0.1
                    ) {
                        scheduleBeat(audioContext, nextBeatTimeRef.current);
                        nextBeatTimeRef.current += beatDurationRef.current;
                    }
                };

                scheduleWindow();
                schedulerIntervalRef.current = window.setInterval(
                    scheduleWindow,
                    25,
                );
            } catch {
                // ignore audio errors
            }
        })();

        return () => {
            canceled = true;
            stopScheduler();
            clearVisualTimeouts();
            if (clockIntervalRef.current !== null) {
                window.clearInterval(clockIntervalRef.current);
                clockIntervalRef.current = null;
            }
        };
    }, [
        isPlaying,
        ensureAudioContext,
        scheduleBeat,
        stopScheduler,
        clearVisualTimeouts,
    ]);

    useEffect(() => {
        return () => {
            stopScheduler();
            clearVisualTimeouts();
            clearTapTimers();
            clearHoldTimers();
            if (clockIntervalRef.current !== null) {
                window.clearInterval(clockIntervalRef.current);
                clockIntervalRef.current = null;
            }
        };
    }, [stopScheduler, clearVisualTimeouts, clearTapTimers, clearHoldTimers]);

    const commitPracticeEvent = useCallback(
        async (outcome: "success" | "failure") => {
            if (!practiceMode || !onPracticeEvent || isLogging) return;

            const elapsedSeconds = getElapsedPracticeSeconds();
            const now = Date.now();

            setIsLogging(true);
            try {
                // Persist practice events as quarter-note BPM values
                const storedQuarter = Math.round(currentBPM * (4 / currentPulse));
                await onPracticeEvent(outcome, storedQuarter, elapsedSeconds);
                lastPracticeLogRef.current = now;
            } finally {
                setIsLogging(false);
            }
        },
        [practiceMode, onPracticeEvent, isLogging, getElapsedPracticeSeconds, currentBPM, currentPulse],
    );

    const handleSuccess = useCallback(async () => {
        if (!practiceMode || !onPracticeEvent || isLogging) return;
        await commitPracticeEvent("success");
        const nextStreak = streak + 1;
        setErrorStreak(0);
        if (nextStreak >= thresholds[practiceMode].success) {
            // Don't exceed display max based on pulse (targetTempo is quarter-note BPM)
            const maxDisplay = Math.max(20, Math.floor(targetTempo * (currentPulse / 4)));
            setCurrentBPM((b) => getNextBPMMark(b, maxDisplay));
            setStreak(0);
        } else {
            setStreak(nextStreak);
        }
        // flash green ring on tempo circle
        try {
            setTempoFeedback("success");
            const t = window.setTimeout(() => setTempoFeedback(null), 700);
            visualTimeoutIdsRef.current.push(t as unknown as number);
        } catch {
            /* ignore */
        }
    }, [
        practiceMode,
        streak,
        thresholds,
        targetTempo,
        commitPracticeEvent,
        isLogging,
        onPracticeEvent,
        currentPulse,
    ]);

    const handleFailure = useCallback(async () => {
        if (!practiceMode || !onPracticeEvent || isLogging) return;
        await commitPracticeEvent("failure");
        setStreak(0);
        setErrorStreak((prevErrorStreak) => {
            const nextErrorStreak = prevErrorStreak + 1;
            if (nextErrorStreak >= thresholds[practiceMode].failure) {
                setCurrentBPM((b) => getPreviousBPMMark(b, 20));
                return 0;
            }

            return nextErrorStreak;
        });
        // flash red ring on tempo circle
        try {
            setTempoFeedback("failure");
            const t = window.setTimeout(() => setTempoFeedback(null), 700);
            visualTimeoutIdsRef.current.push(t as unknown as number);
        } catch {
            /* ignore */
        }
    }, [
        practiceMode,
        thresholds,
        commitPracticeEvent,
        isLogging,
        onPracticeEvent,
    ]);

    const streakDotCount = useMemo(() => {
        if (!practiceMode) return 0;
        return thresholds[practiceMode].success;
    }, [practiceMode, thresholds]);

    const filledStreakDots = useMemo(
        () => Math.min(Math.abs(streak) + 1, streakDotCount),
        [streak, streakDotCount],
    );

    const { setMeasureMode } = useSongs();

    return (
        <div className="metronome-shell">
            <div className="main-controls-row">
                <div className="corner-buttons top-left">
                    <Button
                        variant="ghost"
                        size="lg"
                        className="tempo-adjust-btn"
                        aria-label="Divide pulse"
                        onClick={() => {
                            if (suppressDecClickRef.current) {
                                suppressDecClickRef.current = false;
                                return;
                            }
                            applyDecreaseStep();
                        }}
                        onPointerDown={(e) => {
                            if (e.pointerType === "mouse" && e.button !== 0)
                                return;
                            e.preventDefault();
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "hidden";
                            }
                            startHoldDecrease();
                        }}
                        onPointerUp={() => {
                            if (decHoldTimeoutRef.current !== null) {
                                window.clearTimeout(decHoldTimeoutRef.current);
                                decHoldTimeoutRef.current = null;
                            }
                            if (decHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    decHoldIntervalRef.current,
                                );
                                decHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                        onPointerCancel={() => {
                            if (decHoldTimeoutRef.current !== null) {
                                window.clearTimeout(decHoldTimeoutRef.current);
                                decHoldTimeoutRef.current = null;
                            }
                            if (decHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    decHoldIntervalRef.current,
                                );
                                decHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                        onPointerLeave={() => {
                            if (decHoldTimeoutRef.current !== null) {
                                window.clearTimeout(decHoldTimeoutRef.current);
                                decHoldTimeoutRef.current = null;
                            }
                            if (decHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    decHoldIntervalRef.current,
                                );
                                decHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                    >
                        ÷
                    </Button>
                </div>

                <div className="corner-buttons top-right">
                    <Button
                        variant="ghost"
                        size="lg"
                        className="tempo-adjust-btn"
                        aria-label="Multiply pulse"
                        onClick={() => {
                            if (suppressIncClickRef.current) {
                                suppressIncClickRef.current = false;
                                return;
                            }
                            applyIncreaseStep();
                        }}
                        onPointerDown={(e) => {
                            if (e.pointerType === "mouse" && e.button !== 0)
                                return;
                            e.preventDefault();
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "hidden";
                            }
                            startHoldIncrease();
                        }}
                        onPointerUp={() => {
                            if (incHoldTimeoutRef.current !== null) {
                                window.clearTimeout(incHoldTimeoutRef.current);
                                incHoldTimeoutRef.current = null;
                            }
                            if (incHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    incHoldIntervalRef.current,
                                );
                                incHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                        onPointerCancel={() => {
                            if (incHoldTimeoutRef.current !== null) {
                                window.clearTimeout(incHoldTimeoutRef.current);
                                incHoldTimeoutRef.current = null;
                            }
                            if (incHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    incHoldIntervalRef.current,
                                );
                                incHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                        onPointerLeave={() => {
                            if (incHoldTimeoutRef.current !== null) {
                                window.clearTimeout(incHoldTimeoutRef.current);
                                incHoldTimeoutRef.current = null;
                            }
                            if (incHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    incHoldIntervalRef.current,
                                );
                                incHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                    >
                        ×
                    </Button>
                </div>

                <div
                    className={`tempo-circle ${beatFlash ? "tempo-circle--beat-flash" : ""} ${tapMode ? "tap-mode" : ""} ${tempoFeedback ? `tempo-circle--feedback-${tempoFeedback}` : ""}`}
                    aria-label="Tempo display"
                    onPointerDown={(e) => {
                        if (!isFreeMode) return;
                        if (e.pointerType === "mouse" && e.button !== 0) return;
                        isDraggingTempoRef.current = true;
                        hasDraggedTempoRef.current = false;
                        dragStartYRef.current = e.clientY;
                        suppressTempoCircleClickRef.current = false;
                        // prevent page vertical scrolling while dragging/tapping
                        if (typeof document !== "undefined" && document.body) {
                            document.body.style.overflow = "hidden";
                        }
                        e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        if (!isDraggingTempoRef.current || !isFreeMode) return;

                        const deltaY = dragStartYRef.current - e.clientY;
                        const sensitivity = 3;
                        const bpmChange = Math.round(deltaY / sensitivity);
                        if (bpmChange === 0) return;

                        hasDraggedTempoRef.current = true;
                        suppressTempoCircleClickRef.current = true;

                        setCurrentBPM((b) =>
                            Math.max(20, Math.min(300, b + bpmChange)),
                        );
                        dragStartYRef.current = e.clientY;
                    }}
                    onPointerUp={(e) => {
                        if (!isFreeMode) return;

                        const wasDragging = isDraggingTempoRef.current;
                        const moved = hasDraggedTempoRef.current;
                        isDraggingTempoRef.current = false;
                        hasDraggedTempoRef.current = false;
                        // restore page scrolling
                        if (typeof document !== "undefined" && document.body) {
                            document.body.style.overflow = "";
                        }
                        if (wasDragging && !moved) {
                            registerTap();
                        }

                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                    }}
                    onPointerCancel={(e) => {
                        isDraggingTempoRef.current = false;
                        hasDraggedTempoRef.current = false;
                        // restore page scrolling
                        if (typeof document !== "undefined" && document.body) {
                            document.body.style.overflow = "";
                        }
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                    }}
                    onClick={() => {
                        if (practiceMode) return;
                        // Tap tempo handled in onPointerUp instead to avoid double-firing
                    }}
                >
                    {showBPM && (
                        <div className="bpm-display">
                            <div className="tempo-name">
                                {tapMode ? "TAP" : tempoName}
                            </div>
                            <div className="pulse-row">
                                <div className="bpm-marking">
                                    <span className="tempo-symbol">
                                        {getTempoMarking(currentPulse)}
                                    </span>
                                    <span className="bpm-number">
                                        <span className="bpm-equals">=</span>
                                        {currentBPM}
                                    </span>
                                </div>
                            </div>
                            <div className="bpm-label">BPM</div>
                        </div>
                    )}
                </div>

                <div className="corner-buttons bottom-left">
                    <Button
                        variant="ghost"
                        size="lg"
                        className="tempo-adjust-btn"
                        aria-label="Decrease tempo"
                        onClick={() => {
                            if (suppressDecClickRef.current) {
                                suppressDecClickRef.current = false;
                                return;
                            }
                            applyDecreaseBPM();
                        }}
                        onPointerDown={(e) => {
                            if (e.pointerType === "mouse" && e.button !== 0)
                                return;
                            e.preventDefault();
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "hidden";
                            }
                            startHoldDecreaseBPM();
                        }}
                        onPointerUp={() => {
                            if (decHoldTimeoutRef.current !== null) {
                                window.clearTimeout(decHoldTimeoutRef.current);
                                decHoldTimeoutRef.current = null;
                            }
                            if (decHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    decHoldIntervalRef.current,
                                );
                                decHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                        onPointerCancel={() => {
                            if (decHoldTimeoutRef.current !== null) {
                                window.clearTimeout(decHoldTimeoutRef.current);
                                decHoldTimeoutRef.current = null;
                            }
                            if (decHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    decHoldIntervalRef.current,
                                );
                                decHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                        onPointerLeave={() => {
                            if (decHoldTimeoutRef.current !== null) {
                                window.clearTimeout(decHoldTimeoutRef.current);
                                decHoldTimeoutRef.current = null;
                            }
                            if (decHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    decHoldIntervalRef.current,
                                );
                                decHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                    >
                        −
                    </Button>
                </div>

                <div className="corner-buttons bottom-right">
                    <Button
                        variant="ghost"
                        size="lg"
                        className="tempo-adjust-btn"
                        aria-label="Increase tempo"
                        onClick={() => {
                            if (suppressIncClickRef.current) {
                                suppressIncClickRef.current = false;
                                return;
                            }
                            applyIncreaseBPM();
                        }}
                        onPointerDown={(e) => {
                            if (e.pointerType === "mouse" && e.button !== 0)
                                return;
                            e.preventDefault();
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "hidden";
                            }
                            startHoldIncreaseBPM();
                        }}
                        onPointerUp={() => {
                            if (incHoldTimeoutRef.current !== null) {
                                window.clearTimeout(incHoldTimeoutRef.current);
                                incHoldTimeoutRef.current = null;
                            }
                            if (incHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    incHoldIntervalRef.current,
                                );
                                incHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                        onPointerCancel={() => {
                            if (incHoldTimeoutRef.current !== null) {
                                window.clearTimeout(incHoldTimeoutRef.current);
                                incHoldTimeoutRef.current = null;
                            }
                            if (incHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    incHoldIntervalRef.current,
                                );
                                incHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                        onPointerLeave={() => {
                            if (incHoldTimeoutRef.current !== null) {
                                window.clearTimeout(incHoldTimeoutRef.current);
                                incHoldTimeoutRef.current = null;
                            }
                            if (incHoldIntervalRef.current !== null) {
                                window.clearInterval(
                                    incHoldIntervalRef.current,
                                );
                                incHoldIntervalRef.current = null;
                            }
                            if (
                                typeof document !== "undefined" &&
                                document.body
                            ) {
                                document.body.style.overflow = "";
                            }
                        }}
                    >
                        +
                    </Button>
                </div>
            </div>

            {practiceMode && streakDotCount > 1 && (
                <>
                    <div className="practice-streak">
                        {Array.from({ length: streakDotCount }).map(
                            (_, index) => (
                                <span
                                    key={`streak-dot-${index}`}
                                        className={`streak-dot ${index < filledStreakDots ? "is-filled" : ""}`}
                                    aria-hidden="true"
                                />
                            ),
                        )}
                        <span className="sr-only" aria-live="polite">
                            {`${filledStreakDots} of ${streakDotCount} streak steps`}
                        </span>
                    </div>
                </>
            )}

            <div className="play-controls">
                <Button
                    variant="ghost"
                    size="md"
                    className="icon-control"
                    aria-label={showBPM ? "Hide BPM" : "Show BPM"}
                    onClick={() => setShowBPM((s) => !s)}
                >
                    {showBPM ? (
                        <VisibilityIcon fontSize="small" aria-hidden="true" />
                    ) : (
                        <VisibilityOffIcon
                            fontSize="small"
                            aria-hidden="true"
                        />
                    )}
                </Button>
                {practiceMode && !isFreeMode && (
                    <Button
                        variant="primary"
                        size="md"
                        className="practice-action-btn practice-fail-btn"
                        onClick={handleFailure}
                        disabled={isLogging}
                        aria-label="Mark as failure"
                    >
                        <CloseIcon fontSize="large" aria-hidden="true" />
                    </Button>
                )}

                <Button
                    variant="warm"
                    size="lg"
                    className="play-control-btn"
                    aria-label={
                        isPlaying ? "Pause metronome" : "Play metronome"
                    }
                    onClick={() => setIsPlaying(!isPlaying)}
                >
                    {isPlaying ? (
                        <PauseIcon className="play-icon" />
                    ) : (
                        <PlayArrowIcon className="play-icon" />
                    )}
                </Button>

                {practiceMode && !isFreeMode && (
                    <Button
                        variant="primary"
                        size="md"
                        className="practice-action-btn practice-success-btn"
                        onClick={handleSuccess}
                        disabled={isLogging}
                        aria-label="Mark as success"
                    >
                        <CheckIcon fontSize="large" aria-hidden="true" />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="md"
                    className="icon-control"
                    aria-label="Settings"
                    onClick={() => setShowSettingsDialog(true)}
                >
                    <SettingsIcon fontSize="small" aria-hidden="true" />
                </Button>
            </div>

            <div className="practice-clock" aria-label="Practice clock">
                {formatClock(practiceClockSeconds)}
            </div>

            <DialogBox
                isOpen={showSettingsDialog}
                title="Settings"
                onClose={() => setShowSettingsDialog(false)}
            >
                <div className="dialog-settings-content">
                    {!isFreeMode && (
                        <div className="settings-section">
                            <label className="settings-label">
                                Practice Mode
                            </label>
                            <div className="settings-mode-options">
                                <button
                                    className={`mode-btn ${practiceMode === "rapid" ? "active" : ""}`}
                                    onClick={async () => {
                                        const newMode =
                                            practiceMode === "rapid"
                                                ? null
                                                : "rapid";
                                        setPracticeMode(newMode);
                                        setStreak(0);
                                        setErrorStreak(0);
                                        if (
                                            !isFreeMode &&
                                            setMeasureMode &&
                                            songId &&
                                            measure?.number
                                        )
                                            await setMeasureMode(
                                                songId,
                                                measure.number,
                                                newMode,
                                            );
                                    }}
                                    disabled={isLogging}
                                >
                                    Rapid
                                </button>
                                <button
                                    className={`mode-btn ${practiceMode === "speed" ? "active" : ""}`}
                                    onClick={async () => {
                                        const newMode =
                                            practiceMode === "speed"
                                                ? null
                                                : "speed";
                                        setPracticeMode(newMode);
                                        setStreak(0);
                                        setErrorStreak(0);
                                        if (
                                            !isFreeMode &&
                                            setMeasureMode &&
                                            songId &&
                                            measure?.number
                                        )
                                            await setMeasureMode(
                                                songId,
                                                measure.number,
                                                newMode,
                                            );
                                    }}
                                    disabled={isLogging}
                                >
                                    Speed
                                </button>
                                <button
                                    className={`mode-btn ${practiceMode === "stability" ? "active" : ""}`}
                                    onClick={async () => {
                                        const newMode =
                                            practiceMode === "stability"
                                                ? null
                                                : "stability";
                                        setPracticeMode(newMode);
                                        setStreak(0);
                                        setErrorStreak(0);
                                        if (
                                            !isFreeMode &&
                                            setMeasureMode &&
                                            songId &&
                                            measure?.number
                                        )
                                            await setMeasureMode(
                                                songId,
                                                measure.number,
                                                newMode,
                                            );
                                    }}
                                    disabled={isLogging}
                                >
                                    Stability
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogBox>
        </div>
    );
}
