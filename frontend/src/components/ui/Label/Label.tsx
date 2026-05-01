import React from 'react';
import './Label.css';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
	children: React.ReactNode;
	className?: string;
}

const Label: React.FC<LabelProps> = ({ children, className = '', ...props }) => {
	const classNames = `label ${className}`.trim();

	return (
		<label className={classNames} {...props}>
			{children}
		</label>
	);
};

export default Label;
