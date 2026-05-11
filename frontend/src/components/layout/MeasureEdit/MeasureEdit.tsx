import React, { useState, useEffect } from 'react';
import type { Measure, Song } from '../../../lib/songs';
import DialogBox from '../../ui/DialogBox/DialogBox';
import './MeasureEdit.css';

interface MeasureEditProps {
	isOpen: boolean;
	measure: Measure | null;
	song?: Song | null;
	selectedMeasures?: number[];
	onClose: () => void;
	onSave: (updatedMeasure: Measure) => Promise<void>;
	onDelete?: (measureNumber: number) => Promise<void>;
	onClearProgress?: (measureNumber: number) => Promise<void>;
	isLoading?: boolean;
}

const MeasureEdit: React.FC<MeasureEditProps> = ({ 
	isOpen, 
	measure, 
	// song,
	selectedMeasures = [],
	onClose, 
	onSave, 
	onDelete, 
	onClearProgress,
	isLoading = false 
}) => {
	const [target, setTarget] = useState(0);
	const [current, setCurrent] = useState(0);
	const [ignoreTempo, setIgnoreTempo] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (measure) {
			setTarget(measure.target ?? 0);
			setCurrent(measure.current ?? 0);
			setIgnoreTempo(Boolean((measure as any).ignoreTempo));
			setError(null);
		}
	}, [measure, isOpen]);

	const handleSave = async () => {
		if (!measure) return;

		if (target < 0) {
			setError('Target tempo cannot be negative');
			return;
		}

		if (target === 0) {
			setError('Target tempo must be greater than 0');
			return;
		}

		try {
			setError(null);
			const updatedMeasure: Measure = {
				...measure,
				current,
				target,
				ignoreTempo,
			};
			await onSave(updatedMeasure);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save measure');
		}
	};

	const handleDelete = async () => {
		if (!measure || !onDelete) return;

		const isMultiple = selectedMeasures.length > 1;
		const confirmDelete = window.confirm(
			isMultiple
				? `Are you sure you want to delete ${selectedMeasures.length} selected measures? This action cannot be undone.`
				: `Are you sure you want to delete Measure ${measure.number}? This action cannot be undone.`
		);

		if (!confirmDelete) return;

		try {
			setError(null);
			await onDelete(measure.number ?? 1);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete measure');
		}
	};

	const handleClearProgress = async () => {
		if (!measure || !onClearProgress) return;

		const isMultiple = selectedMeasures.length > 1;
		const confirmClear = window.confirm(
			isMultiple
				? `Are you sure you want to clear all practice progress for ${selectedMeasures.length} selected measures? This will delete all event data.`
				: `Are you sure you want to clear all practice progress for Measure ${measure.number}? This will delete all event data.`
		);

		if (!confirmClear) return;

		try {
			setError(null);
			await onClearProgress(measure.number ?? 1);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear progress');
		}
	};

	return (
		<DialogBox
			isOpen={isOpen}
			title={`Edit Measure ${measure?.number ?? 1}`}
			onClose={onClose}
			onConfirm={handleSave}
			confirmLabel="Save Changes"
			isLoading={isLoading}
		>
			<div className="measure-edit-form">
				{error && <div className="measure-edit-error">{error}</div>}
				<div className="form-group">
					<label htmlFor="measure-target" className="form-label">
						Target Tempo (BPM)
					</label>
					<input
						id="measure-target"
						type="number"
						className="form-input"
						value={target}
						onChange={(e) => setTarget(Math.max(0, parseInt(e.target.value) || 0))}
						min="0"
						disabled={isLoading}
					/>
				</div>

				<div className="form-group form-group--checkbox">
					<label htmlFor="measure-ignore-tempo" className="form-label checkbox-label">
						<input
							type="checkbox"
							id="measure-ignore-tempo"
							checked={ignoreTempo}
							onChange={(e) => setIgnoreTempo(e.target.checked)}
							disabled={isLoading}
						/>
						Ignore Tempo
					</label>
				</div>

				<div className="measure-edit-actions">
					{onClearProgress && (
						<button
							className="btn btn-secondary"
							onClick={handleClearProgress}
							disabled={isLoading}
							title="Clear all practice progress and event data for this measure"
						>
							Clear Progress
						</button>
					)}
					{onDelete && (
						<button
							className="btn btn-danger"
							onClick={handleDelete}
							disabled={isLoading}
							title="Delete this measure"
						>
							Delete
						</button>
					)}
				</div>
			</div>
		</DialogBox>
	);
};

export default MeasureEdit;
