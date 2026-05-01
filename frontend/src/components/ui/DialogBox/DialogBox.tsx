import React from 'react';
import './DialogBox.css';

interface DialogBoxProps {
	isOpen: boolean;
	title: string;
	onClose: () => void;
	onConfirm?: () => void;
	confirmLabel?: string;
	children: React.ReactNode;
	isLoading?: boolean;
}

const DialogBox: React.FC<DialogBoxProps> = ({
	isOpen,
	title,
	onClose,
	onConfirm,
	confirmLabel = 'Save',
	children,
	isLoading = false,
}) => {
	if (!isOpen) return null;

	return (
		<div className="dialog-overlay">
			<div className="dialog-box" onClick={(e) => e.stopPropagation()}>
				<div className="dialog-header">
					<h2 className="dialog-title">{title}</h2>
					<button
						className="dialog-close"
						onClick={onClose}
						type="button"
						aria-label="Close dialog"
					>
						×
					</button>
				</div>

				<div className="dialog-content">
					{children}
				</div>

				<div className="dialog-footer">
					<button
						className="dialog-btn dialog-btn--secondary"
						onClick={onClose}
						disabled={isLoading}
					>
						Cancel
					</button>
					{onConfirm && (
						<button
							className="dialog-btn dialog-btn--primary"
							onClick={onConfirm}
							disabled={isLoading}
						>
							{isLoading ? 'Saving...' : confirmLabel}
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

export default DialogBox;
