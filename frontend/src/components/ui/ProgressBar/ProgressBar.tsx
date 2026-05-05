import './ProgressBar.css';

interface ProgressBarProps {
  old_value: number;
  new_value: number;
}

export function ProgressBar({ old_value, new_value }: ProgressBarProps) {
  const oldNormalized = Math.min(1, Math.max(0, old_value));
  const newNormalized = Math.min(1, Math.max(0, new_value));
  const difference = newNormalized - oldNormalized;
  const unchangedPortion = Math.min(oldNormalized, newNormalized) * 100;
  const increasePortion = Math.max(difference, 0) * 100;
  const decreasePortion = Math.max(-difference, 0) * 100;
  const percentage = Math.floor(newNormalized * 100);
  const roundedChange = Math.floor(difference * 100);
  const changeText = `${roundedChange > 0 ? `+${roundedChange}` : roundedChange}%`;
  const changeClass = roundedChange >= 0 ? 'progress-change-positive' : 'progress-change-negative';

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-track">
        <div
          className="progress-bar-segment progress-bar-old"
          style={{
            width: `${unchangedPortion}%`,
          }}
        />
        {increasePortion > 0 && (
          <div
            className="progress-bar-segment progress-bar-positive"
            style={{
              width: `${increasePortion}%`,
            }}
          />
        )}
        {decreasePortion > 0 && (
          <div
            className="progress-bar-segment progress-bar-negative"
            style={{
              width: `${decreasePortion}%`,
            }}
          />
        )}
      </div>
      <div className="progress-bar-stats">
        <span className="progress-bar-percentage">{percentage}%</span>
        <span className={`progress-bar-change ${changeClass}`}>
          {changeText}
        </span>
      </div>
    </div>
  );
}
