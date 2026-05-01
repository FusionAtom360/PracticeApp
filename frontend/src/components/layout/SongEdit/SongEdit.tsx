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
	isLoading?: boolean;
}

const SongEdit: React.FC<SongEditProps> = ({ isOpen, song, onClose, onSave, isLoading = false }) => {
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
			</div>
		</DialogBox>
	);
};

export default SongEdit;
