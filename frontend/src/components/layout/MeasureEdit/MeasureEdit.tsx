import React, { useState, useEffect } from 'react';
import type { Measure } from '../../../lib/songs';
import DialogBox from '../../ui/DialogBox/DialogBox';
import './MeasureEdit.css';

interface MeasureEditProps {
	isOpen: boolean;
	measure: Measure | null;
	onClose: () => void;
	onSave: (updatedMeasure: Measure) => Promise<void>;
	isLoading?: boolean;
}

const MeasureEdit: React.FC<MeasureEditProps> = ({ isOpen, measure, onClose, onSave, isLoading = false }) => {
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
			</div>
		</DialogBox>
	);
};

export default MeasureEdit;
