import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
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
        case 32:
            return "";
        default:
            return "";
    }
}

const SUBDIVISION_OPTIONS = [1, 2, 3, 4, 6];
const ACCENT_OPTIONS = [1, 2, 3, 4, 6];
const ACCENT_STATES: Array<number | null> = [null, ...ACCENT_OPTIONS];

function readFreePracticeNumber(key: string, fallback: number): number {
    if (typeof window === "undefined") return fallback;

    try {
        const stored = Number.parseInt(window.localStorage.getItem(key) ?? "", 10);
        return Number.isFinite(stored) ? stored : fallback;
    } catch {
        return fallback;
    }
}

function getLatestMetronomeBPM(
    events?: Array<{ timestamp?: number | string; type?: string; value?: number | string | null }>,
): number | null {
    if (!Array.isArray(events)) return null;

    const recentEvents = [...events]
        .filter((event) => event && event.type === "metronome")
        .sort((first, second) => {
            const firstTimestamp = Number(first.timestamp);
            const secondTimestamp = Number(second.timestamp);
            if (Number.isFinite(firstTimestamp) && Number.isFinite(secondTimestamp)) {
                return secondTimestamp - firstTimestamp;
            }
            return 0;
        });

    for (const ev of recentEvents) {
        const bpm = Number(ev.value);
        if (Number.isFinite(bpm) && bpm > 0) {
            return bpm;
        }
    }

    return null;
}

function getNearestBPMMark(value: number): number {
    let nearest = BPMMarks[0];
    let bestDistance = Math.abs(value - nearest);

    for (let i = 1; i < BPMMarks.length; i++) {
        const mark = BPMMarks[i];
        const distance = Math.abs(value - mark);
        if (distance < bestDistance) {
            nearest = mark;
            bestDistance = distance;
        }
    }

    return nearest;
}

function getPracticeStartBPM(
    selectedMeasures: Measure[] | undefined,
    measure: Measure | null | undefined,
    targetTempo: number,
): number {
    const floorBPM = targetTempo / 4;
    const measuresToInspect =
        Array.isArray(selectedMeasures) && selectedMeasures.length > 0
            ? selectedMeasures
            : measure
              ? [measure]
              : [];

    const measureMarks = measuresToInspect
        .map((item) => {
            const latestLoggedBPM = getLatestMetronomeBPM(item?.events);
            if (latestLoggedBPM !== null) {
                return latestLoggedBPM;
            }

            const summaryTempo = Number(item?.averageTempo);
            if (Number.isFinite(summaryTempo) && summaryTempo > 0) {
                return summaryTempo;
            }

            const measureTarget = Number(item?.target);
            return Number.isFinite(measureTarget) && measureTarget > 0
                ? measureTarget / 4
                : floorBPM;
        })
        .filter((value) => Number.isFinite(value) && value > 0);

    const lowestMark =
        measureMarks.length > 0 ? Math.min(...measureMarks) : floorBPM;
    const scaledMark = lowestMark * 0.9;
    const snappedMark = getNearestBPMMark(scaledMark);
    return Math.max(floorBPM, snappedMark);
}

type PracticeMode = "rapid" | "speed" | "stability" | null;
const BPMMarks = [
    20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56,
    58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116,
    120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208, 216, 224,
    232, 240, 250, 260, 270, 280, 290, 300,
];

// const droneWhiteKeys = ["C", "D", "E", "F", "G", "A", "B"];
// const droneBlackKeys = [
//     { note: "Db", position: 1 },
//     { note: "Eb", position: 2 },
//     { note: "Gb", position: 4 },
//     { note: "Ab", position: 5 },
//     { note: "Bb", position: 6 },
// ];

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

function readStoredPracticeBPM(storageKey: string | null): number | null {
    if (!storageKey) return null;

    try {
        const stored = Number(localStorage.getItem(storageKey));
        return Number.isFinite(stored) && stored >= 20 ? stored : null;
    } catch {
        return null;
    }
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
        measureNumbers?: number[],
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

    const practiceTempoStorageKey = useMemo(() => {
        if (!songId || !practiceScopeKey) {
            return null;
        }

        return `practice-tempo:${songId}:${practiceScopeKey}`;
    }, [songId, practiceScopeKey]);

    const [currentPulse, setCurrentPulse] = useState(4); // always default to quarter on mount
    const [subdivisionCount, setSubdivisionCount] = useState(() =>
        readFreePracticeNumber("practice-free-subdivision", 1),
    );
    const [accentInterval, setAccentInterval] = useState<number | null>(() => {
        const stored = readFreePracticeNumber("practice-free-accent", 4);
        if (stored === 0) return null;
        return ACCENT_STATES.includes(stored) ? stored : 4;
    });
    const initialTempo = useMemo(() => {
        if (isFreeMode) {
            const savedQuarter = localStorage.getItem("practice-free-bpm");
            const quarter = savedQuarter ? Number.parseInt(savedQuarter, 10) : NaN;
            if (Number.isFinite(quarter) && quarter > 0) {
                // Convert stored quarter-note BPM to displayed BPM for current pulse
                return Math.max(20, Math.round(quarter * (currentPulse / 4)));
            }
            return 120;
        }

        return (
            readStoredPracticeBPM(practiceTempoStorageKey) ??
            getPracticeStartBPM(selectedMeasures, measure, targetTempo)
        );
    }, [isFreeMode, measure, practiceTempoStorageKey, selectedMeasures, targetTempo, currentPulse]);

    const [currentBPM, setCurrentBPM] = useState<number>(initialTempo);
    const [showBPM, setShowBPM] = useState(true);
    const [practiceMode, setPracticeMode] = useState<PracticeMode>(
        getMostConservativeMode(selectedMeasures, measure),
    );
    const [showFailureDialog, setShowFailureDialog] = useState(false);
    const [streak, setStreak] = useState(0);
    const [errorStreak, setErrorStreak] = useState(0);
    const [tempoFeedback, setTempoFeedback] = useState<
        "success" | "failure" | null
    >(null);
    const [isLogging, setIsLogging] = useState(false);
    const isLoggingRef = useRef(false);
    const [beatFlash, setBeatFlash] = useState(false);
    const [tapMode, setTapMode] = useState(false);
    const [practiceClockSeconds, setPracticeClockSeconds] = useState(0);
    // const [selectedDrone, setSelectedDrone] = useState(() => {
    //     if (typeof window === "undefined") return "A";
    //     return window.localStorage.getItem("practice-selected-drone") ?? "A";
    // });
    // const [isDronePlaying, setIsDronePlaying] = useState(false);
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
    const dragStartXRef = useRef(0);
    const dragStartYRef = useRef(0);
    const suppressTempoCircleClickRef = useRef(false);
    const incHoldTimeoutRef = useRef<number | null>(null);
    const incHoldIntervalRef = useRef<number | null>(null);
    const decHoldTimeoutRef = useRef<number | null>(null);
    const decHoldIntervalRef = useRef<number | null>(null);
    const suppressDecClickRef = useRef(false);
    const suppressIncClickRef = useRef(false);
    const beatDurationRef = useRef<number>(60 / initialTempo);
    const beatIndexRef = useRef(0);
    const hasInitializedFromMeasureRef = useRef<string | null>(null);
    const hasPlayedOnceRef = useRef(false);
    const practiceClockSecondsRef = useRef(0);
    const droneFirstAudioRef = useRef<HTMLAudioElement | null>(null);
    const droneSecondAudioRef = useRef<HTMLAudioElement | null>(null);
    const droneTimerRefs = useRef<number[]>([]);
    // const droneTransitionRef = useRef(0);

    const tempoName = getTempoName(currentBPM);

    const clearDroneTimers = useCallback(() => {
        for (const timer of droneTimerRefs.current) {
            window.clearTimeout(timer);
            window.clearInterval(timer);
        }
        droneTimerRefs.current = [];
    }, []);

    const stopDrone = useCallback(() => {
        clearDroneTimers();
        for (const audio of [droneFirstAudioRef.current, droneSecondAudioRef.current]) {
            if (!audio) continue;
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 0;
        }
        // setIsDronePlaying(false);
    }, [clearDroneTimers]);

    // const startDrone = useCallback((note: string) => {
    //     clearDroneTimers();
    //     const first = droneFirstAudioRef.current ?? new Audio();
    //     const second = droneSecondAudioRef.current ?? new Audio();
    //     droneFirstAudioRef.current = first;
    //     droneSecondAudioRef.current = second;

    //     first.src = `/drones/${encodeURIComponent(note)}.mp3`;
    //     first.loop = true;
    //     first.volume = 1;
    //     second.pause();
    //     second.currentTime = 0;
    //     second.volume = 0;
    //     second.src = first.src;
    //     droneTransitionRef.current = 0;

    //     const scheduleTransition = (activeIndex: number) => {
    //         const transitionTimer = window.setTimeout(() => {
    //             const active = activeIndex === 0 ? droneFirstAudioRef.current : droneSecondAudioRef.current;
    //             const incoming = activeIndex === 0 ? droneSecondAudioRef.current : droneFirstAudioRef.current;
    //             if (!active || !incoming) return;

    //             incoming.currentTime = 0;
    //             incoming.volume = 0;
    //             void incoming.play().catch(() => stopDrone());
    //             const startedAt = performance.now();
    //             const fadeTimer = window.setInterval(() => {
    //                 const progress = Math.min(1, (performance.now() - startedAt) / 10000);
    //                 active.volume = 1 - progress;
    //                 incoming.volume = progress;
    //                 if (progress >= 1) {
    //                     window.clearInterval(fadeTimer);
    //                     active.pause();
    //                     active.currentTime = 0;
    //                     droneTransitionRef.current = activeIndex === 0 ? 1 : 0;
    //                     scheduleTransition(droneTransitionRef.current);
    //                 }
    //             }, 50);
    //             droneTimerRefs.current.push(fadeTimer);
    //         }, 20000);
    //         droneTimerRefs.current.push(transitionTimer);
    //     };

    //     void first.play().then(() => {
    //         setIsDronePlaying(true);
    //         scheduleTransition(0);
    //     }).catch(() => {
    //         stopDrone();
    //     });
    // }, [clearDroneTimers, stopDrone]);

    // useEffect(() => {
    //     window.localStorage.setItem("practice-selected-drone", selectedDrone);
    // }, [selectedDrone]);

    useEffect(() => () => stopDrone(), [stopDrone]);

    const thresholds = useMemo(
        () => ({
            rapid: { success: 1, failure: 1 },
            speed: { success: 3, failure: 2 },
            stability: { success: 7, failure: 3 },
        }),
        [],
    );

    useEffect(() => {
        try {
            if (isFreeMode) {
                // Persist as quarter-note BPM (rounded).
                const quarter = Math.round(currentBPM * (4 / currentPulse));
                localStorage.setItem("practice-free-bpm", String(quarter));
                localStorage.setItem(
                    "practice-free-subdivision",
                    String(subdivisionCount),
                );
                localStorage.setItem(
                    "practice-free-accent",
                    String(accentInterval ?? 0),
                );
            } else if (
                practiceTempoStorageKey &&
                (selectedMeasures.length > 0 || measure)
            ) {
                localStorage.setItem(practiceTempoStorageKey, String(Math.round(currentBPM)));
            }
        } catch {
            // ignore storage failures
        }
    }, [accentInterval, currentBPM, currentPulse, isFreeMode, measure, practiceTempoStorageKey, selectedMeasures.length, subdivisionCount]);

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

    // When measure data arrives after initial load, sync to the computed practice seed BPM
    useEffect(() => {
        if (isFreeMode) {
            return;
        }

        const scopeKey = practiceScopeKey ?? "song";
        if (scopeKey === hasInitializedFromMeasureRef.current) {
            return;
        }

        if (readStoredPracticeBPM(practiceTempoStorageKey) !== null) {
            hasInitializedFromMeasureRef.current = scopeKey;
            return;
        }

        const measuresToInspect =
            selectedMeasures.length > 0 ? selectedMeasures : measure ? [measure] : [];
        const hasLoadedEvents =
            measuresToInspect.length > 0 &&
            measuresToInspect.every((item) => Array.isArray(item.events));
        if (!hasLoadedEvents) {
            return;
        }

        const seedBPM = getPracticeStartBPM(selectedMeasures, measure, targetTempo);
        queueMicrotask(() => {
            setCurrentBPM(seedBPM);
        });
        hasInitializedFromMeasureRef.current = scopeKey;
    }, [isFreeMode, measure, practiceScopeKey, practiceTempoStorageKey, selectedMeasures, targetTempo]);

    useEffect(() => {
        beatDurationRef.current = 60 / currentBPM / subdivisionCount;
    }, [currentBPM, subdivisionCount]);

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
        (audioContext: AudioContext, beatTime: number, beatIndex: number) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            const isAccented =
                accentInterval !== null &&
                beatIndex % (accentInterval * subdivisionCount) === 0;
            oscillator.frequency.value = isAccented ? 1000 : 800;
            oscillator.type = "sine";

            gainNode.gain.setValueAtTime(isAccented ? 1.5 : 0.85, beatTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, beatTime + 0.12);

            oscillator.start(beatTime);
            oscillator.stop(beatTime + 0.12);

            if (beatIndex % subdivisionCount === 0) {
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
            }
        },
        [accentInterval, subdivisionCount],
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
    }, [practiceMode, currentPulse]);

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
    }, [practiceMode, currentPulse]);

    const applyDecreaseBPM = useCallback(() => {
        setCurrentBPM((b) => Math.max(20, b - 1));
    }, []);

    const applyIncreaseBPM = useCallback(() => {
        setCurrentBPM((b) => Math.min(300, b + 1));
    }, []);

    const cycleSubdivision = useCallback(() => {
        setSubdivisionCount((current) => {
            const currentIndex = SUBDIVISION_OPTIONS.indexOf(current);
            return SUBDIVISION_OPTIONS[
                (currentIndex + 1) % SUBDIVISION_OPTIONS.length
            ];
        });
    }, []);

    const cycleAccent = useCallback(() => {
        setAccentInterval((current) => {
            const currentIndex = ACCENT_STATES.indexOf(current);
            return ACCENT_STATES[
                (currentIndex + 1) % ACCENT_STATES.length
            ];
        });
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
                if (!hasPlayedOnceRef.current) {
                    // Play an immediate beat on the very first play press.
                    const immediateTime = audioContext.currentTime + 0.001;
                    beatIndexRef.current = 0;
                    scheduleBeat(audioContext, immediateTime, beatIndexRef.current);
                    hasPlayedOnceRef.current = true;
                    beatIndexRef.current += 1;
                    nextBeatTimeRef.current = immediateTime + beatDurationRef.current;
                } else {
                    nextBeatTimeRef.current = audioContext.currentTime + 0.05;
                    beatIndexRef.current = 0;
                }

                const scheduleWindow = () => {
                    while (
                        nextBeatTimeRef.current <
                        audioContext.currentTime + 0.1
                    ) {
                        scheduleBeat(
                            audioContext,
                            nextBeatTimeRef.current,
                            beatIndexRef.current,
                        );
                        beatIndexRef.current += 1;
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
        (outcome: "success" | "failure", measureNumbers?: number[]) => {
            if (!practiceMode || !onPracticeEvent || isLogging || isLoggingRef.current) return;

            const elapsedSeconds = getElapsedPracticeSeconds();
            const now = Date.now();

            isLoggingRef.current = true;
            setIsLogging(true);
            // Persist practice events as quarter-note BPM values without blocking UI feedback.
            const storedQuarter = Math.round(currentBPM * (4 / currentPulse));
            void onPracticeEvent(outcome, storedQuarter, elapsedSeconds, measureNumbers)
                .then(() => {
                    lastPracticeLogRef.current = now;
                })
                .catch((error: unknown) => {
                    console.error("Failed to persist practice event", error);
                });
            isLoggingRef.current = false;
            setIsLogging(false);
        },
        [practiceMode, onPracticeEvent, isLogging, getElapsedPracticeSeconds, currentBPM, currentPulse],
    );

    const handleSuccess = useCallback(() => {
        if (!practiceMode || !onPracticeEvent || isLogging) return;
        commitPracticeEvent("success");
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

    const activeMeasureNumbers = useMemo(
        () =>
            (selectedMeasures.length > 0
                ? selectedMeasures
                : measure
                  ? [measure]
                  : []
            )
                .map((item) => Number(item.number))
                .filter((number) => Number.isInteger(number) && number > 0),
        [measure, selectedMeasures],
    );

    const applyFailure = useCallback(
        (failedMeasureNumber?: number) => {
            if (failedMeasureNumber === undefined) {
                commitPracticeEvent("failure", activeMeasureNumbers);
            } else {
                const failedIndex = activeMeasureNumbers.indexOf(failedMeasureNumber);
                if (failedIndex < 0) return;

                const precedingMeasures = activeMeasureNumbers.slice(0, failedIndex);
                if (precedingMeasures.length > 0) {
                    commitPracticeEvent("success", precedingMeasures);
                }
                commitPracticeEvent("failure", [failedMeasureNumber]);
            }

            setShowFailureDialog(false);
            setStreak(0);
            setErrorStreak((prevErrorStreak) => {
                const nextErrorStreak = prevErrorStreak + 1;
                if (nextErrorStreak >= thresholds[practiceMode!].failure) {
                    setCurrentBPM((b) => getPreviousBPMMark(b, 20));
                    return 0;
                }

                return nextErrorStreak;
            });
            try {
                setTempoFeedback("failure");
                const t = window.setTimeout(() => setTempoFeedback(null), 700);
                visualTimeoutIdsRef.current.push(t as unknown as number);
            } catch {
                /* ignore */
            }
        },
        [activeMeasureNumbers, commitPracticeEvent, practiceMode, thresholds],
    );

    const handleFailure = useCallback(() => {
        if (!practiceMode || !onPracticeEvent || isLogging) return;
        if (activeMeasureNumbers.length <= 1) {
            applyFailure(activeMeasureNumbers[0]);
            return;
        }
        setShowFailureDialog(true);
    }, [activeMeasureNumbers, applyFailure, isLogging, onPracticeEvent, practiceMode]);

    const streakDotCount = useMemo(() => {
        if (!practiceMode) return 0;
        return thresholds[practiceMode].success;
    }, [practiceMode, thresholds]);

    const filledStreakDots = useMemo(
        () => Math.min(Math.abs(streak) + 1, streakDotCount),
        [streak, streakDotCount],
    );

    const { setMeasureMode } = useSongs();

    const applyPracticeMode = useCallback(
        async (nextMode: PracticeMode) => {
            setPracticeMode(nextMode);
            setStreak(0);
            setErrorStreak(0);

            if (isFreeMode || !songId || !setMeasureMode) {
                return;
            }

            const selectedMeasureNumbers = Array.isArray(selectedMeasures)
                ? selectedMeasures
                      .map((m) => Number(m?.number))
                      .filter((n) => Number.isInteger(n) && n > 0)
                : [];

            const fallbackMeasureNumber = Number(measure?.number);
            const measureNumbersToUpdate =
                selectedMeasureNumbers.length > 0
                    ? Array.from(new Set(selectedMeasureNumbers))
                    : Number.isInteger(fallbackMeasureNumber) &&
                        fallbackMeasureNumber > 0
                      ? [fallbackMeasureNumber]
                      : [];

            if (measureNumbersToUpdate.length === 0) {
                return;
            }

            await Promise.all(
                measureNumbersToUpdate.map((measureNumber) =>
                    setMeasureMode(songId, measureNumber, nextMode),
                ),
            );
        },
        [isFreeMode, measure, selectedMeasures, setMeasureMode, songId],
    );

    const cyclePracticeMode = useCallback(() => {
        const modes: PracticeMode[] = ["rapid", "speed", "stability", null];
        const currentIndex = modes.indexOf(practiceMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        void applyPracticeMode(nextMode);
    }, [applyPracticeMode, practiceMode]);

    const modeDotCount =
        practiceMode === "rapid"
            ? 1
            : practiceMode === "speed"
              ? 2
              : practiceMode === "stability"
                ? 3
                : 0;

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
                        if (e.pointerType === "mouse" && e.button !== 0) return;
                        if (!isFreeMode && !practiceMode) return;
                        isDraggingTempoRef.current = true;
                        hasDraggedTempoRef.current = false;
                        dragStartXRef.current = e.clientX;
                        dragStartYRef.current = e.clientY;
                        suppressTempoCircleClickRef.current = false;
                        // prevent page vertical scrolling while dragging/tapping
                        if (typeof document !== "undefined" && document.body) {
                            document.body.style.overflow = "hidden";
                        }
                        e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        if (!isDraggingTempoRef.current) return;

                        if (!isFreeMode) {
                            const deltaX = e.clientX - dragStartXRef.current;
                            const deltaY = e.clientY - dragStartYRef.current;
                            if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
                                hasDraggedTempoRef.current = true;
                            }
                            return;
                        }

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
                        if (!isDraggingTempoRef.current) return;

                        const wasDragging = isDraggingTempoRef.current;
                        const moved = hasDraggedTempoRef.current;
                        isDraggingTempoRef.current = false;
                        hasDraggedTempoRef.current = false;
                        // restore page scrolling
                        if (typeof document !== "undefined" && document.body) {
                            document.body.style.overflow = "";
                        }

                        if (isFreeMode && wasDragging && !moved) {
                            registerTap();
                        }

                        if (!isFreeMode && practiceMode && wasDragging) {
                            const deltaX = e.clientX - dragStartXRef.current;
                            const deltaY = Math.abs(e.clientY - dragStartYRef.current);
                            const swipeThreshold = 40;
                            if (
                                Math.abs(deltaX) >= swipeThreshold &&
                                Math.abs(deltaX) > deltaY
                            ) {
                                if (deltaX > 0) {
                                    void handleSuccess();
                                } else {
                                    void handleFailure();
                                }
                            }
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
                    {!showBPM && (
                        <div className="tempo-symbol-large" aria-hidden="true">
                            {getTempoMarking(currentPulse)}
                        </div>
                    )}

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
                {!isFreeMode ? (
                    <Button
                        variant="ghost"
                        size="md"
                        className="icon-control mode-cycle-control transport-secondary"
                        onClick={cyclePracticeMode}
                        disabled={isLogging}
                        aria-label={
                            practiceMode
                                ? `Practice mode: ${practiceMode}. Change mode`
                                : "Enable rapid practice mode"
                        }
                    >
                        <span className="mode-dots" aria-hidden="true">
                            {Array.from({ length: modeDotCount }).map((_, index) => (
                                <span key={index} className="mode-dot" />
                            ))}
                        </span>
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="md"
                        className="icon-control mode-cycle-control transport-secondary"
                        disabled
                        aria-hidden="true"
                    />
                )}
                <Button
                    variant="ghost"
                    size="md"
                    className="icon-control transport-secondary"
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
                        className="practice-action-btn practice-fail-btn transport-primary"
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
                    className="play-control-btn transport-primary"
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
                        className="practice-action-btn practice-success-btn transport-primary"
                        onClick={handleSuccess}
                        disabled={isLogging}
                        aria-label="Mark as success"
                    >
                        <CheckIcon fontSize="large" aria-hidden="true" />
                    </Button>
                )}
                <span className="transport-mobile-break" aria-hidden="true" />

                <Button
                    variant="ghost"
                    size="md"
                    className="icon-control cycle-control transport-secondary"
                    onClick={cycleSubdivision}
                    aria-label={`Subdivide each beat ${subdivisionCount} times`}
                >
                    <span className="settings-glyph" aria-hidden="true">
                        {getTempoMarking(Math.min(32, currentPulse * 2))}
                    </span>
                    <span className="cycle-control-label">×{subdivisionCount}</span>
                </Button>

                <Button
                    variant="ghost"
                    size="md"
                    className="icon-control cycle-control transport-secondary"
                    onClick={cycleAccent}
                    aria-label={
                        accentInterval === null
                            ? "Turn accents on"
                            : `Accent every ${accentInterval} beats`
                    }
                    aria-pressed={accentInterval !== null}
                >
                    <span className="settings-glyph" aria-hidden="true">
                        {getTempoMarking(currentPulse)}
                    </span>
                    <span className="cycle-control-label">
                        {accentInterval === null ? "Off" : `×${accentInterval}`}
                    </span>
                </Button>
            </div>

            <div className="practice-clock" aria-label="Practice clock">
                {formatClock(practiceClockSeconds)}
            </div>

            <DialogBox
                isOpen={showFailureDialog}
                title="Where did the failure occur?"
                onClose={() => setShowFailureDialog(false)}
            >
                <div className="failure-measure-options">
                    <button
                        type="button"
                        className="dialog-btn dialog-btn--primary failure-skip-btn"
                        onClick={() => applyFailure()}
                    >
                        Skip
                    </button>
                    {activeMeasureNumbers.map((measureNumber) => (
                        <button
                            key={measureNumber}
                            type="button"
                            className="dialog-btn dialog-btn--secondary failure-measure-btn"
                            onClick={() => applyFailure(measureNumber)}
                        >
                            <strong>{measureNumber}</strong>
                        </button>
                    ))}
                </div>
            </DialogBox>

            <DialogBox
                isOpen={false}
                title="Settings"
                onClose={() => undefined}
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
                                        await applyPracticeMode(newMode);
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
                                        await applyPracticeMode(newMode);
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
                                        await applyPracticeMode(newMode);
                                    }}
                                    disabled={isLogging}
                                >
                                    Stability
                                </button>
                            </div>
                        </div>
                    )}
                    {/* <div className="settings-section drone-settings-section">
                        <div>
                            <label className="settings-label" id="drone-key-label">
                                Tuning drone
                            </label>
                            <div className="drone-keyboard" role="group" aria-labelledby="drone-key-label">
                                {droneWhiteKeys.map((note) => (
                                    <button
                                        key={note}
                                        type="button"
                                        className={`drone-key drone-key-white ${selectedDrone === note ? "active" : ""}`}
                                        aria-label={`Play ${note} drone`}
                                        aria-pressed={selectedDrone === note}
                                        onClick={() => {
                                            setSelectedDrone(note);
                                            if (isDronePlaying) startDrone(note);
                                        }}
                                    >
                                        {note}
                                    </button>
                                ))}
                                {droneBlackKeys.map(({ note, position }) => (
                                    <button
                                        key={note}
                                        type="button"
                                        className={`drone-key drone-key-black ${selectedDrone === note ? "active" : ""}`}
                                        style={{ left: `${(position - 0.5) * (100 / 7)}%` }}
                                        aria-label={`Play ${note} drone`}
                                        aria-pressed={selectedDrone === note}
                                        onClick={() => {
                                            setSelectedDrone(note);
                                            if (isDronePlaying) startDrone(note);
                                        }}
                                    >
                                        {note}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="drone-transport">
                            <Button
                                variant="primary"
                                size="md"
                                className="drone-transport-btn"
                                onClick={() => startDrone(selectedDrone)}
                                disabled={isDronePlaying}
                            >
                                <PlayArrowIcon fontSize="small" aria-hidden="true" />
                                Start
                            </Button>
                            <Button
                                variant="ghost"
                                size="md"
                                className="drone-transport-btn"
                                onClick={stopDrone}
                                disabled={!isDronePlaying}
                            >
                                <StopIcon fontSize="small" aria-hidden="true" />
                                Stop
                            </Button>
                        </div>
                        <span className="drone-status" aria-live="polite">
                            {isDronePlaying ? `${selectedDrone} drone playing` : "Drone stopped"}
                        </span>
                    </div> */}
                </div>
            </DialogBox>
        </div>
    );
}
