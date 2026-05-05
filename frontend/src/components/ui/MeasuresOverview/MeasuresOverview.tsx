import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Song, Measure } from '../../../lib/songs';
import { calculateMeasureProgress, calculateMeasureProgressBefore24h } from '../../../lib/songs';
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
	const { saveSongsToServer, songs, selectedMeasures, setSelectedMeasures, clearSelectedMeasures, setActiveSong } = useSongs();
	const navigate = useNavigate();
	const [editingMeasure, setEditingMeasure] = useState<Measure | null>(null);
	const [firstSelectedNumber, setFirstSelectedNumber] = useState<number | null>(null);
	const [hasRangeSelection, setHasRangeSelection] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	const measures = song?.measures ?? [];

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

	return (
		<>
			<div className="measures-overview">
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
							<div className="measure-actions">
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
										if (!song) {
											return;
										}

										// If nothing is selected, make the clicked measure the active selection
										if (!selectedMeasures || selectedMeasures.length === 0) {
											setSelectedMeasures(measureNumber, measureNumber);
											setFirstSelectedNumber(measureNumber);
											setHasRangeSelection(false);
										} else if (!selectedMeasures.includes(measureNumber)) {
											// Clicked outside the active range: reset to this measure.
											setSelectedMeasures(measureNumber, measureNumber);
											setFirstSelectedNumber(measureNumber);
											setHasRangeSelection(false);
										}

										navigate(`/songs/${encodeURIComponent((song.id ?? "").trim())}/practice`);
									}}
								/>
								{/* <Button
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
								/> */}
							</div>
						</div>
					);
				})}
			</div>

			<MeasureEdit
				isOpen={isEditDialogOpen}
				measure={editingMeasure}
				onClose={() => setIsEditDialogOpen(false)}
				onSave={handleSaveMeasure}
				isLoading={isSaving}
			/>
		</>
	);
};

export default MeasuresOverview;
