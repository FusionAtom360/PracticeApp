import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Song, Measure } from '../../../lib/songs';
import {
	calculateMeasureProgress,
	calculateMeasureProgressBefore24h,
	calculateSongAverageAccuracy,
	calculateSongAverageTempo,
	deleteMeasure,
	clearMeasureProgress,
} from '../../../lib/songs';
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
	const { updateMeasureOnServer, updateMeasuresOnServer, selectedMeasures, setSelectedMeasures, clearSelectedMeasures, setActiveSong, reloadSongs } = useSongs();
	const navigate = useNavigate();
	const [editingMeasure, setEditingMeasure] = useState<Measure | null>(null);
	const [firstSelectedNumber, setFirstSelectedNumber] = useState<number | null>(null);
	const [hasRangeSelection, setHasRangeSelection] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	const measures = song?.measures ?? [];
	const hasSelectedMeasures = selectedMeasures.length > 0;

	const selectedMeasureObjects = useMemo(() => {
		if (!song || selectedMeasures.length === 0) {
			return [] as Measure[];
		}

		return selectedMeasures
			.map((number) => measures.find((measure) => measure.number === number))
			.filter((measure): measure is Measure => Boolean(measure));
	}, [song, measures, selectedMeasures]);

	const selectedStats = useMemo(() => {
		if (!song || selectedMeasureObjects.length === 0) {
			return { tempo: 0, accuracy: 0 };
		}

		const scopedSong: Song = {
			...song,
			measures: selectedMeasureObjects,
		};

		return {
			tempo: calculateSongAverageTempo(scopedSong),
			accuracy: calculateSongAverageAccuracy(scopedSong),
		};
	}, [song, selectedMeasureObjects]);

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
			if (selectedMeasures.length > 0) {
				clearSelectedMeasures();
				setFirstSelectedNumber(null);
				setHasRangeSelection(false);
			}

			const measureNumbers = selectedMeasures.length > 0 ? selectedMeasures : (updatedMeasure.number ? [updatedMeasure.number] : []);
			if (measureNumbers.length === 0) return;
			const update = {
				initial: updatedMeasure.current,
				target: updatedMeasure.target,
				ignore_tempo: updatedMeasure.ignoreTempo,
				mode: updatedMeasure.mode,
			};
			if (measureNumbers.length === 1) {
				await updateMeasureOnServer(song.id, measureNumbers[0], update);
			} else {
				await updateMeasuresOnServer(
					song.id,
					measureNumbers.map((number) => ({ number, ...update })),
				);
			}
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
						<div className="measures-selection-bar__meta">
							<span className="measures-selection-bar__count">
								{selectedMeasures.length} selected
							</span>
							<span className="measures-selection-bar__stats">
								{selectedStats.tempo} BPM • {selectedStats.accuracy}% accuracy
							</span>
						</div>
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
