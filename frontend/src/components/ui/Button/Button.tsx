import React from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'warm';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	label?: string;
	variant?: ButtonVariant;
	size?: ButtonSize;
	children?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
	label,
	variant = 'primary',
	size = 'md',
	children,
	className = '',
	...props
}) => {
	const classNames = `btn btn--${variant} btn--${size} ${className}`.trim();

	return (
		<button className={classNames} {...props}>
			{children || label}
		</button>
	);
};

export default Button;
