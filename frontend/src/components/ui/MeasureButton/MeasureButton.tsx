import React from 'react';
import './MeasureButton.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'warm';
type ButtonSize = 'sm' | 'md' | 'lg';

interface MeasureButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	label?: string;
	variant?: ButtonVariant;
	size?: ButtonSize;
	children?: React.ReactNode;
}

const MeasureButton: React.FC<MeasureButtonProps> = ({
	label,
	variant = 'primary',
	size = 'md',
	children,
	className = '',
	...props
}) => {
	const classNames = `measure-btn measure-btn--${variant} measure-btn--${size} ${className}`.trim();

	return (
		<button className={classNames} {...props}>
			{children || label}
		</button>
	);
};

export default MeasureButton;
