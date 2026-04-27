import Button, { type ButtonProps } from "@mui/material/Button";

function PrimaryButton(props: ButtonProps) {
    return <Button variant="contained" color="primary" {...props} />;
}

export default PrimaryButton;
