import type { ElementType } from "react";
import "./IconButton.css";

interface IconButtonProps {
    Icon: ElementType;
    label: string;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
}

export default function IconButton({ Icon, label, onClick, className = '', disabled = false }: IconButtonProps) {
    return (
        <button className={`icon-button ${className}`.trim()} type="button" aria-label={label} onClick={onClick} disabled={disabled}>
            <Icon fontSize="small" aria-hidden="true" />
        </button>
    );
}
