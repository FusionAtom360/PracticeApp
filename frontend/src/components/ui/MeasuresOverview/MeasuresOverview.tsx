import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Song, Measure } from '../../../lib/songs';
import { calculateMeasureProgress, calculateMeasureProgressBefore24h, deleteMeasure, clearMeasureProgress } from '../../../lib/songs';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import Button from '../Button/Button';
import MeasureEdit from '../../layout/MeasureEdit/MeasureEdit';
import { useSongs } from '../../../context/SongContext';
import './MeasuresOverview.css';
import { useEffect } from 'react';

interface MeasuresOverviewProps {
	song: Song | null;
}

const MeasuresOverview: React.FC<MeasuresOverviewProps> = ({ song }) => {
	const { saveSongsToServer, songs, selectedMeasures, setSelectedMeasures, clearSelectedMeasures, setActiveSong, reloadSongs } = useSongs();
	const navigate = useNavigate();
	const [editingMeasure, setEditingMeasure] = useState<Measure | null>(null);
	const [firstSelectedNumber, setFirstSelectedNumber] = useState<number | null>(null);
	const [hasRangeSelection, setHasRangeSelection] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	const measures = song?.measures ?? [];
	const hasSelectedMeasures = selectedMeasures.length > 0;

	useEffect(() => {
		setActiveSong(song?.id ?? null);
	}, [song?.id, setActiveSong]);

	const handleMeasureCardClick = (measureNumber: number) => {
		if (firstSelectedNumber === null || hasRangeSelection) {
			setFirstSelectedNumber(measureNumber);
			setSelectedMeasures(measureNumber, measureNumber);
			setHasRangeSelection(false);
		} else {
			setSelectedMeasures(firstSelectedNumber, measureNumber);
			setHasRangeSelection(true);
		}
	};

	const handleEditMeasure = (measure: Measure) => {
		setEditingMeasure(measure);
		setIsEditDialogOpen(true);
	};

	const handleEditSelectedMeasures = () => {
		if (!hasSelectedMeasures) {
			return;
		}

		const firstSelectedMeasureNumber = selectedMeasures[0];
		const firstSelectedMeasure = measures.find(
			(measure) => measure.number === firstSelectedMeasureNumber,
		);

		if (firstSelectedMeasure) {
			handleEditMeasure(firstSelectedMeasure);
		}
	};

	const handlePracticeSelection = (measureNumber?: number) => {
		if (!song) {
			return;
		}

		if (!hasSelectedMeasures) {
			if (measureNumber === undefined) {
				return;
			}

			setSelectedMeasures(measureNumber, measureNumber);
			setFirstSelectedNumber(measureNumber);
			setHasRangeSelection(false);
		} else if (
			measureNumber !== undefined &&
			!selectedMeasures.includes(measureNumber)
		) {
			// Clicked outside the active range: reset to this measure.
			setSelectedMeasures(measureNumber, measureNumber);
			setFirstSelectedNumber(measureNumber);
			setHasRangeSelection(false);
		}

		navigate(`/songs/${encodeURIComponent((song.id ?? "").trim())}/practice`);
	};

	const handleSaveMeasure = async (updatedMeasure: Measure) => {
		if (!song) return;

		setIsSaving(true);
		try {
			const updatedMeasures = [...measures];

			if (selectedMeasures.length > 0) {
				for (const measureNumber of selectedMeasures) {
					const measureIndex = updatedMeasures.findIndex(m => m.number === measureNumber);
					if (measureIndex !== -1) {
						updatedMeasures[measureIndex] = { ...updatedMeasures[measureIndex], ...updatedMeasure, number: measureNumber };
					}
				}
				clearSelectedMeasures();
				setFirstSelectedNumber(null);
				setHasRangeSelection(false);
			} else {
				// Single measure edit
				const measureIndex = measures.findIndex(m => m.number === updatedMeasure.number);
				if (measureIndex === -1) return;
				updatedMeasures[measureIndex] = updatedMeasure;
			}

			const updatedSong: Song = { ...song, measures: updatedMeasures };
			const updatedSongs = songs.map(s => s.id === updatedSong.id ? updatedSong : s);

			await saveSongsToServer(updatedSongs);
			setIsEditDialogOpen(false);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDeleteMeasure = async (measureNumber: number) => {
		if (!song) return;

		setIsSaving(true);
		try {
			// If multiple measures are selected, delete all of them
			const measuresToDel = selectedMeasures.length > 0 ? selectedMeasures : [measureNumber];
			
			// Delete in reverse order to avoid renumbering issues
			const sorted = [...measuresToDel].sort((a, b) => b - a);
			for (const num of sorted) {
				await deleteMeasure(song.id, num);
			}
			
			await reloadSongs();
			clearSelectedMeasures();
			setFirstSelectedNumber(null);
			setHasRangeSelection(false);
		} finally {
			setIsSaving(false);
		}
	};

	const handleClearMeasureProgress = async (measureNumber: number) => {
		if (!song) return;

		setIsSaving(true);
		try {
			// If multiple measures are selected, clear progress for all of them
			const measuresToClear = selectedMeasures.length > 0 ? selectedMeasures : [measureNumber];
			
			for (const num of measuresToClear) {
				await clearMeasureProgress(song.id, num);
			}
			
			await reloadSongs();
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<>
			<div className={`measures-overview ${hasSelectedMeasures ? 'measures-overview--with-selection' : ''}`}>
				{measures.map((measure, index: number) => {
					const measureNumber = measure?.number ?? index + 1;
				const progress = calculateMeasureProgress(measure);

				return (
						<div
							key={index}
							className={`measure-card ${selectedMeasures.includes(measureNumber) ? 'measure-card--selected' : ''}`}
							data-measure-number={measureNumber}
							onClick={() => handleMeasureCardClick(measureNumber)}
						>
							<div className="measure-number">
								{measureNumber}
							</div>
							<div className="measure-content">
								<div className="measure-progress">
									<ProgressBar new_value={progress} old_value={calculateMeasureProgressBefore24h(measure)} />
								</div>
							</div>
							{/* <div className="measure-actions">
								<Button
									label="Edit"
									onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleEditMeasure(measure); }}
									className="secondary"
									variant="secondary"
									size="sm"
								/>
								<Button
									label="Practice"
									onClick={(e: React.MouseEvent) => {
										e.stopPropagation();
										handlePracticeSelection(measureNumber);
									}}
								/>
								<Button
									label="Record Success"
									onClick={(e: React.MouseEvent) => {
										e.stopPropagation();
										if (!song) return;
										addPracticeEvent((song.id ?? "").trim(), 'success', measureNumber).catch(() => {});
									}}
									className="secondary"
									variant="secondary"
									size="sm"
								/>
								<Button
									label="Record Failure"
									onClick={(e: React.MouseEvent) => {
										e.stopPropagation();
										if (!song) return;
										addPracticeEvent((song.id ?? "").trim(), 'failure', measureNumber).catch(() => {});
									}}
									className="secondary"
									variant="secondary"
									size="sm"
								/>
							</div> */}
						</div>
					);
				})}
			</div>

			{hasSelectedMeasures && (
				<div className="measures-selection-bar" role="region" aria-label="Selected measures actions">
					<div className="measures-selection-bar__content">
						<span className="measures-selection-bar__count">
							{selectedMeasures.length} selected
						</span>
						<div className="measures-selection-bar__actions">
							<Button
								label="Edit"
								onClick={handleEditSelectedMeasures}
								className="secondary"
								variant="secondary"
								size="sm"
							/>
							<Button
								label="Practice"
								onClick={() => handlePracticeSelection()}
								size="sm"
							/>
						</div>
					</div>
				</div>
			)}

			<MeasureEdit
				isOpen={isEditDialogOpen}
				measure={editingMeasure}
				song={song}
				selectedMeasures={selectedMeasures}
				onClose={() => setIsEditDialogOpen(false)}
				onSave={handleSaveMeasure}
				onDelete={handleDeleteMeasure}
				onClearProgress={handleClearMeasureProgress}
				isLoading={isSaving}
			/>
		</>
	);
};

export default MeasuresOverview;
