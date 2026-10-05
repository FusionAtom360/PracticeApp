import { useState, type FormEvent } from "react";
import { useAuth } from "../../../context/AuthContext";
import "./Auth.css";

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
            <section className="auth-card">
                <div className="auth-mark" aria-hidden="true">♩</div>
                <h1>{registering ? "Begin your practice" : "Welcome back"}</h1>
                <p className="auth-intro">{registering ? "Create a private space for your songs and progress." : "Pick up where your practice left off."}</p>
                <form onSubmit={submit}>
                    <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
                    <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? "new-password" : "current-password"} minLength={6} required /></label>
                    {error && <p className="auth-message auth-message--error" role="alert">{error}</p>}
                    {message && <p className="auth-message auth-message--success" role="status">{message}</p>}
                    <button className="auth-submit" type="submit">{registering ? "Create account" : "Sign in"}</button>
                </form>
                <button className="auth-switch" type="button" onClick={() => setRegistering((value) => !value)}>
                    {registering ? "Already have an account?" : "Create an account"}
                </button>
            </section>
        </main>
    );
}
