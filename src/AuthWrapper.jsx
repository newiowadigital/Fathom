import { useState, useEffect } from "react";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import TimelineTool from "./timeline-tool";

export default function AuthWrapper() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [resetSent, setResetSent] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleAuth = async () => {
    try {
      setError("");
      setResetSent("");
      if (isSignUp) {
        if (pass.length < 6) {
          setError("Password must be at least 6 characters");
          return;
        }
        await createUserWithEmailAndPassword(auth, email, pass);
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch (e) {
      const msg = e.code?.replace("auth/", "").replace(/-/g, " ");
      setError(msg || e.message);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError("Enter your email address first");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent("Password reset email sent! Check your inbox.");
      setError("");
    } catch (e) {
      setError("Could not send reset email. Check the address.");
    }
  };

  // Loading state
  if (loading) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", fontFamily: "'Quicksand', sans-serif",
      fontSize: 16, color: "#888", background: "#f5f5f5"
    }}>
      Loading...
    </div>
  );

  // Not signed in — show login form
  if (!user) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#f0f0f0", fontFamily: "'Quicksand', sans-serif"
    }}>
      <div style={{
        width: 400, padding: "40px 36px", background: "#fff",
        borderRadius: 18, boxShadow: "0 4px 30px rgba(0,0,0,0.08)"
      }}>
        <h2 style={{
          textAlign: "center", marginBottom: 6, fontSize: 22,
          fontWeight: 700, color: "#1a1a1a"
        }}>
          Fathom
        </h2>
        <p style={{
          textAlign: "center", fontSize: 13, color: "#999",
          marginBottom: 28
        }}>
          {isSignUp ? "Create your account" : "Sign in to continue"}
        </p>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          type="email"
          autoComplete="email"
          style={{
            width: "100%", padding: "12px 16px",
            border: "2px solid #e0e0e0", borderRadius: 12,
            fontSize: 14, fontFamily: "'Quicksand'", fontWeight: 500,
            color: "#1a1a1a", background: "#fafafa",
            outline: "none", boxSizing: "border-box", marginBottom: 12,
            transition: "border-color 0.2s"
          }}
          onFocus={(e) => e.target.style.borderColor = "#1a1a1a"}
          onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
        />

        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          onKeyDown={(e) => e.key === "Enter" && handleAuth()}
          style={{
            width: "100%", padding: "12px 16px",
            border: "2px solid #e0e0e0", borderRadius: 12,
            fontSize: 14, fontFamily: "'Quicksand'", fontWeight: 500,
            color: "#1a1a1a", background: "#fafafa",
            outline: "none", boxSizing: "border-box", marginBottom: 16,
            transition: "border-color 0.2s"
          }}
          onFocus={(e) => e.target.style.borderColor = "#1a1a1a"}
          onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
        />

        {error && (
          <p style={{
            color: "#e53935", fontSize: 13, margin: "0 0 12px",
            padding: "8px 12px", background: "#fce4ec",
            borderRadius: 8, fontWeight: 500
          }}>
            {error}
          </p>
        )}

        {resetSent && (
          <p style={{
            color: "#2e7d32", fontSize: 13, margin: "0 0 12px",
            padding: "8px 12px", background: "#e8f5e9",
            borderRadius: 8, fontWeight: 500
          }}>
            {resetSent}
          </p>
        )}

        <button
          onClick={handleAuth}
          style={{
            width: "100%", padding: "12px",
            background: "#1a1a1a", color: "#fff",
            border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 700,
            fontFamily: "'Quicksand'",
            cursor: "pointer", marginBottom: 12,
            transition: "opacity 0.2s"
          }}
          onMouseEnter={(e) => e.target.style.opacity = 0.85}
          onMouseLeave={(e) => e.target.style.opacity = 1}
        >
          {isSignUp ? "Create Account" : "Sign In"}
        </button>

        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", fontSize: 13
        }}>
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(""); setResetSent(""); }}
            style={{
              background: "none", border: "none",
              color: "#1a1a1a", cursor: "pointer",
              fontWeight: 600, fontFamily: "'Quicksand'",
              textDecoration: "underline", fontSize: 13
            }}
          >
            {isSignUp ? "Have an account? Sign in" : "Need an account? Sign up"}
          </button>

          {!isSignUp && (
            <button
              onClick={handleReset}
              style={{
                background: "none", border: "none",
                color: "#999", cursor: "pointer",
                fontFamily: "'Quicksand'", fontSize: 12
              }}
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Signed in — render the app
  return (
    <TimelineTool
      userId={user.uid}
      onSignOut={() => signOut(auth)}
    />
  );
}
