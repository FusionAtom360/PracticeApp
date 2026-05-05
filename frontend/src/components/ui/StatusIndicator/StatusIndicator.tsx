import { useSongs } from '../../../context/SongContext';
import './StatusIndicator.css';

export default function StatusIndicator() {
	const { error } = useSongs();
	const isHealthy = !error;

	return (
		<span
			className={`status-indicator ${isHealthy ? 'status-indicator--healthy' : 'status-indicator--error'}`}
			role="status"
			aria-label={isHealthy ? 'Server connected' : 'Server request failed'}
			title={isHealthy ? 'Server connected' : 'Server request failed'}
		/>
	);
}
