import { useState, type FormEvent } from "react";
import { useAuth } from "../../../context/AuthContext";

export default function Auth() {
    const { signIn, signUp } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [registering, setRegistering] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError("");
        setMessage("");
        try {
            if (registering) {
                await signUp(email, password);
                setMessage("Account created. Check your email if confirmation is enabled.");
            } else {
                await signIn(email, password);
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Authentication failed");
        }
    }

    return (
        <main className="auth-page">
            <form onSubmit={submit}>
                <h1>{registering ? "Create account" : "Sign in"}</h1>
                <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
                <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>
                {error && <p role="alert">{error}</p>}
                {message && <p role="status">{message}</p>}
                <button type="submit">{registering ? "Create account" : "Sign in"}</button>
                <button type="button" onClick={() => setRegistering((value) => !value)}>
                    {registering ? "Already have an account?" : "Create an account"}
                </button>
            </form>
        </main>
    );
}
