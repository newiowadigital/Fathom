import { useState, useEffect } from "react";
import { auth, isConfigured } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import Fathom from "./prep/Fathom";
import "./prep/fathom.css";

const STRIPS = [
  ["xd", "1", "EXT. RIVER ROAD", "DAWN", "1 2/8"],
  ["id", "3", "INT. MERIDIAN DINER", "MORNING", "2 1/8"],
  ["xd", "5", "EXT. DINER PARKING LOT", "DAY", "1 4/8"],
  ["in", "8", "INT. MARA'S APARTMENT", "NIGHT", "6/8"],
  ["xn", "10", "EXT. BRIDGE", "NIGHT", "1 1/8"],
];

export default function AuthWrapper() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isConfigured);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [resetSent, setResetSent] = useState("");

  useEffect(() => {
    if (!isConfigured) return undefined;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleAuth = async (e) => {
    e?.preventDefault();
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
    } catch (err) {
      const msg = err.code?.replace("auth/", "").replace(/-/g, " ");
      setError(msg || err.message);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError("Enter your email address first");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent("Password reset email sent. Check your inbox.");
      setError("");
    } catch (err) {
      setError("Could not send reset email. Check the address.");
    }
  };

  /* No Firebase project configured yet: run entirely in this browser. */
  if (!isConfigured) return <Fathom />;

  if (loading) return <div className="auth" style={{ placeItems: "center", display: "grid", color: "var(--tx3)" }}>Loading…</div>;

  if (user) return <Fathom userId={user.uid} userEmail={user.email} onSignOut={() => signOut(auth)} />;

  return (
    <div className="auth">
      <div className="auth-hero">
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, letterSpacing: ".08em" }}>
          <div className="brand-mark" style={{ width: 32, height: 32 }}>▶</div> FATHOM
        </div>
        <div>
          <h1>From script to call sheet.</h1>
          <p>Break down scenes, map real locations, track cast, props and shots, build the shooting order, and print every pre-production document from one plan.</p>
          <div className="strips-demo">
            {STRIPS.map(([k, n, set, tod, pg]) => (
              <div key={n} className={"strip " + k} style={{ cursor: "default", color: "#15171c" }}>
                <div className="s-num">{n}</div>
                <div className="s-main"><div className="s-h">{set}</div><div className="s-sub" style={{ display: "block" }}>{tod}</div></div>
                <div className="s-meta"><span>{pg} pg</span></div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ color: "#6b7482", fontSize: 12 }}>New Iowa Digital · newiowafilms.com</div>
      </div>
      <div className="auth-form">
        <form className="auth-card" onSubmit={handleAuth}>
          <h2>{isSignUp ? "Create your account" : "Welcome back"}</h2>
          <p className="muted" style={{ marginTop: 0 }}>{isSignUp ? "Your productions sync to the cloud." : "Sign in to open your productions."}</p>
          <label className="field"><span className="lab">Email</span>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" /></label>
          <label className="field"><span className="lab">Password</span>
            <input className="input" value={pass} onChange={(e) => setPass(e.target.value)} type="password" autoComplete={isSignUp ? "new-password" : "current-password"} /></label>
          {error && <div className="auth-err" role="alert">{error}</div>}
          {resetSent && <div className="auth-ok">{resetSent}</div>}
          <button type="submit" className="btn btn-pri" style={{ width: "100%", justifyContent: "center", padding: "10px", marginTop: 16 }}>
            {isSignUp ? "Create account" : "Sign in"}
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button type="button" className="linkbtn" onClick={() => { setIsSignUp(!isSignUp); setError(""); setResetSent(""); }}>
              {isSignUp ? "Have an account? Sign in" : "Need an account? Sign up"}
            </button>
            {!isSignUp && <button type="button" className="linkbtn" style={{ color: "var(--tx3)", fontWeight: 500 }} onClick={handleReset}>Forgot password?</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
