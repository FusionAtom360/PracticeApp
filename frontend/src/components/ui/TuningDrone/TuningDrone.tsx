import "./TuningDrone.css";

type DroneOption = {
    note: string;
};

const droneOptions: DroneOption[] = [
    { note: "C" },
    { note: "C#" },
    { note: "D" },
    { note: "D#" },
    { note: "E" },
    { note: "F" },
    { note: "F#" },
    { note: "G" },
    { note: "G#" },
    { note: "A" },
    { note: "A#" },
    { note: "B" },
];

interface TuningDroneProps {
    selectedDrone: DroneOption | null;
    setSelectedDrone: (drone: DroneOption | null) => void;
}

export default function TuningDrone({
    selectedDrone,
    setSelectedDrone,
}: TuningDroneProps) {
    return (
        <div>
            <div className="selector-label" style={{ marginBottom: "0.75rem" }}>
                Reference pitch
            </div>
            <div className="drone-selector">
                {droneOptions.map((option) => {
                    const isSelected = selectedDrone?.note === option.note;

                    return (
                        <button
                            key={option.note}
                            type="button"
                            aria-pressed={isSelected}
                            className={`drone-option ${isSelected ? "is-active" : ""}`}
                            onClick={() =>
                                setSelectedDrone(
                                    isSelected ? null : option,
                                )
                            }
                        >
                            <div className="drone-option-note">
                                {option.note}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
