import React from 'react';
import './SongStats.css';

interface StatItemProps {
    value: string | number;
    label: string;
}

const StatItem: React.FC<StatItemProps> = ({ value, label }) => (
    <div className="stat-item">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
    </div>
);

interface SongStatsProps {
    timePracticed: string;
    tempo: number;
    accuracy: number;
    lastPractice: string;
}

const SongStats: React.FC<SongStatsProps> = ({ timePracticed, tempo, accuracy, lastPractice }) => {
    return (
        <div className="song-stats">
            <StatItem value={timePracticed} label="Time Practiced" />
            <StatItem value={`${tempo} BPM`} label="Current Tempo" />
            <StatItem value={`${accuracy}%`} label="Accuracy" />
            <StatItem value={lastPractice} label="Last Practice" />
        </div>
    );
};

export default SongStats;
