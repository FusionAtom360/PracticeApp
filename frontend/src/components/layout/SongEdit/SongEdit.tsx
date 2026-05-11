import React, { useState } from 'react';
import type { Song } from '../../../lib/songs';
import DialogBox from '../../ui/DialogBox/DialogBox';
import './SongEdit.css';

interface SongEditSubmission {
	song: Song;
	imageFile?: File | null;
	audioFile?: File | null;
}

interface SongEditProps {
	isOpen: boolean;
	song: Song | null;
	onClose: () => void;
	onSave: (payload: SongEditSubmission) => Promise<void>;
	onDelete?: (songId: string) => Promise<void>;
	onClearProgress?: (songId: string) => Promise<void>;
	isLoading?: boolean;
}

const SongEdit: React.FC<SongEditProps> = ({ isOpen, song, onClose, onSave, onDelete, onClearProgress, isLoading = false }) => {
	const [title, setTitle] = useState(song?.title ?? '');
	const [composer, setComposer] = useState(song?.composer ?? '');
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [audioFile, setAudioFile] = useState<File | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleSave = async () => {
		if (!song) return;

		if (!title.trim()) {
			setError('Title is required');
			return;
		}

		if (!composer.trim()) {
			setError('Composer is required');
			return;
		}

		try {
			setError(null);
			const updatedSong: Song = {
				...song,
				title: title.trim(),
				composer: composer.trim(),
			};
			await onSave({ song: updatedSong, imageFile, audioFile });
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save song');
		}
	};

	const handleDelete = async () => {
		if (!song || !onDelete) return;

		const confirmDelete = window.confirm(
			`Are you sure you want to delete "${song.title}" by ${song.composer}? This action cannot be undone.`
		);

		if (!confirmDelete) return;

		try {
			setError(null);
			await onDelete(song.id);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete song');
		}
	};

	const handleClearProgress = async () => {
		if (!song || !onClearProgress) return;

		const confirmClear = window.confirm(
			`Are you sure you want to clear all practice progress for "${song.title}"? This will delete all event data.`
		);

		if (!confirmClear) return;

		try {
			setError(null);
			await onClearProgress(song.id);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear progress');
		}
	};

	if (!song) {
		return null;
	}

	return (
		<DialogBox
			isOpen={isOpen}
			title="Edit Piece Details"
			onClose={onClose}
			onConfirm={handleSave}
			confirmLabel="Save Changes"
			isLoading={isLoading}
		>
			<div className="song-edit-form">
				{error && <div className="song-edit-error">{error}</div>}

				<div className="form-group">
					<label htmlFor="song-title" className="form-label">
						Title
					</label>
					<input
						id="song-title"
						type="text"
						className="form-input"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Enter song title"
						disabled={isLoading}
					/>
				</div>

				<div className="form-group">
					<label htmlFor="song-composer" className="form-label">
						Composer
					</label>
					<input
						id="song-composer"
						type="text"
						className="form-input"
						value={composer}
						onChange={(e) => setComposer(e.target.value)}
						placeholder="Enter composer name"
						disabled={isLoading}
					/>
				</div>

				<div className="form-group">
					<label htmlFor="song-image" className="form-label">
						Image
					</label>
					<input
						id="song-image"
						type="file"
						className="form-input"
						accept="image/*"
						onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
						disabled={isLoading}
					/>
					<p className="form-help">Leave empty to keep the current image.</p>
				</div>

				<div className="form-group">
					<label htmlFor="song-audio" className="form-label">
						Audio
					</label>
					<input
						id="song-audio"
						type="file"
						className="form-input"
						accept="audio/*"
						onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
						disabled={isLoading}
					/>
					<p className="form-help">Leave empty to keep the current audio.</p>
				</div>

				<div className="song-edit-actions">
					{onClearProgress && (
						<button
							className="btn btn-secondary"
							onClick={handleClearProgress}
							disabled={isLoading}
							title="Clear all practice progress and event data"
						>
							Clear Progress
						</button>
					)}
					{onDelete && (
						<button
							className="btn btn-danger"
							onClick={handleDelete}
							disabled={isLoading}
							title="Delete this piece and all associated data"
						>
							Delete
						</button>
					)}
				</div>
			</div>
		</DialogBox>
	);
};

export default SongEdit;
