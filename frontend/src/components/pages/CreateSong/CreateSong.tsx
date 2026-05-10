import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { useSongs } from "../../../context/SongContext";
import { createSong } from "../../../lib/songs";
import Button from "../../ui/Button/Button";
import "./CreateSong.css";

export default function CreateSong() {
	const navigate = useNavigate();
	const { reloadSongs } = useSongs();
	const [title, setTitle] = useState("");
	const [subtitle, setSubtitle] = useState("");
	const [composer, setComposer] = useState("");
	const [measureCount, setMeasureCount] = useState("1");
	const [initialTempo, setInitialTempo] = useState("");
	const [targetTempo, setTargetTempo] = useState("120");
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [audioFile, setAudioFile] = useState<File | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const trimmedTitle = title.trim();
		const trimmedSubtitle = subtitle.trim();
		const trimmedComposer = composer.trim();
		const measureTotal = Number(measureCount);
		const initialTempoValue = Number(initialTempo);
		const targetTempoValue = Number(targetTempo);

		if (!trimmedTitle || !trimmedComposer) {
			setError("Title and composer are required.");
			return;
		}

		if (!Number.isInteger(measureTotal) || measureTotal < 1) {
			setError("Number of measures must be at least 1.");
			return;
		}

		if (!Number.isFinite(initialTempoValue) || !Number.isFinite(targetTempoValue)) {
			setError("Tempo values must be numbers.");
			return;
		}

		setIsSaving(true);
		setError(null);

		try {
			const result = await createSong({
				title: trimmedTitle,
				subtitle: trimmedSubtitle,
				composer: trimmedComposer,
				measureCount: measureTotal,
				initialTempo: initialTempoValue,
				targetTempo: targetTempoValue,
				imageFile,
				audioFile,
			});

			await reloadSongs();
			navigate(`/songs/${encodeURIComponent(result.song.id)}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create song.");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<main className="create-song">
			<section className="create-song__panel">
				<div className="create-song__header">
					<h1>Input new practice piece</h1>
				</div>

				<form className="create-song__form" onSubmit={handleSubmit}>
					<div className="create-song__grid">
						<label className="create-song__field">
							<span>Title</span>
							<input
								type="text"
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="Moonlight Sonata"
								required
							/>
						</label>

						<label className="create-song__field">
							<span>Subtitle</span>
							<input
								type="text"
								value={subtitle}
								onChange={(event) => setSubtitle(event.target.value)}
								placeholder="I. Adagio sostenuto"
							/>
						</label>

						<label className="create-song__field">
							<span>Composer</span>
							<input
								type="text"
								value={composer}
								onChange={(event) => setComposer(event.target.value)}
								placeholder="Ludwig van Beethoven"
								required
							/>
						</label>

						<label className="create-song__field">
							<span>Number of measures</span>
							<input
								type="number"
								min="1"
								step="1"
								value={measureCount}
								onChange={(event) => setMeasureCount(event.target.value)}
								required
							/>
						</label>

						<label className="create-song__field">
							<span>Initial tempo</span>
							<input
								type="number"
								min="1"
								step="1"
								value={initialTempo}
								onChange={(event) => setInitialTempo(event.target.value)}
							/>
						</label>

						<label className="create-song__field">
							<span>Target tempo</span>
							<input
								type="number"
								min="1"
								step="1"
								value={targetTempo}
								onChange={(event) => setTargetTempo(event.target.value)}
								required
							/>
						</label>

						<label className="create-song__field create-song__field--full">
						<span>Image upload (optional)</span>
						<input
							type="file"
							accept="image/*"
							onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
						/>
						<small>{imageFile ? imageFile.name : "Choose a cover image (optional)."}</small>					</label>
						<label className="create-song__field create-song__field--full">
						<span>Audio upload (optional)</span>
						<input
							type="file"
							accept="audio/*"
							onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
						/>
						<small>{audioFile ? audioFile.name : "Choose an audio file (optional)."}</small>
						</label>
					</div>

					{error ? <p className="create-song__error">{error}</p> : null}

					<div className="create-song__actions">
						<Button type="submit" label={isSaving ? "Saving..." : "Create song"} disabled={isSaving} />
						<Button type="button" variant="secondary" onClick={() => navigate(-1)}>
							Cancel
						</Button>
					</div>
				</form>
			</section>
		</main>
	);
}
