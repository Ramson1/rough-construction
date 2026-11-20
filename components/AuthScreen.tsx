"use client";

import { useState } from "react";
import { BBT, GAME } from "@/lib/brand";
import { login, signUp } from "@/lib/storage";
import { DEFAULT_CUSTOMIZATION, type Account, type Gender } from "@/lib/types";
import { BrandMark, GameWordmark, StudioFooter } from "./BrandMark";

type Tab = "create" | "login";

export default function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (account: Account, isNew: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("create");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (tab === "create" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (tab === "create") {
        const result = await signUp({
          nickname,
          gender,
          password,
          customization: { ...DEFAULT_CUSTOMIZATION, body: gender },
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        onAuthenticated(result.account, true);
      } else {
        const result = await login(nickname, password);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        onAuthenticated(result.account, false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-blueprint" aria-hidden="true" />
      <div className="auth-hazard" aria-hidden="true" />

      <header className="auth-topbar">
        <BrandMark />
        <span className="auth-topbar-note">LIVE SITE · TOWER 07</span>
      </header>

      <main className="auth-main">
        <section className="auth-hero">
          <GameWordmark />
          <p className="auth-lead">
            The tower is unfinished. The crews are not. Claim the high-rise, use
            the site for cover and take a point every time you drop a rival.
          </p>

          <div className="auth-points">
            <div>
              <strong>10</strong>
              <span>POINTS PER OPERATOR</span>
            </div>
            <div>
              <strong>01</strong>
              <span>POINT PER ELIMINATION</span>
            </div>
            <div>
              <strong>06</strong>
              <span>FLOORS OF COVER</span>
            </div>
          </div>

          <div className="auth-mode-strip">
            <span>1 V 1 DUEL</span>
            <span>LONE WOLF</span>
            <span>TEAM BATTLE</span>
            <span>SITE TRAINING</span>
          </div>
        </section>

        <section className="auth-card panel">
          <div className="auth-card-head">
            <span className="eyebrow">BLACK-BOX TECH ACCESS</span>
            <h1>{tab === "create" ? "Join the crew" : "Clock back in"}</h1>
            <p>
              {tab === "create"
                ? "Create a callsign. No email, no birthday — just a name, a crew and a password."
                : "Use the callsign and password saved on this device."}
            </p>
          </div>

          <div className="segmented auth-tabs" role="tablist">
            <button
              type="button"
              className={tab === "create" ? "active" : ""}
              onClick={() => {
                setTab("create");
                setError(null);
              }}
            >
              NEW OPERATOR
            </button>
            <button
              type="button"
              className={tab === "login" ? "active" : ""}
              onClick={() => {
                setTab("login");
                setError(null);
              }}
            >
              SIGN IN
            </button>
          </div>

          <form onSubmit={submit} className="auth-form">
            <label className="field">
              <span>CALLSIGN</span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="e.g. SCAFFOLD_KING"
                maxLength={16}
                autoComplete="username"
                spellCheck={false}
                required
              />
              {tab === "create" && (
                <small>3–16 characters · letters, numbers, underscore</small>
              )}
            </label>

            {tab === "create" && (
              <div className="field">
                <span>CREW / BODY TYPE</span>
                <div className="segmented gender-picker">
                  {(
                    [
                      ["male", "MALE"],
                      ["female", "FEMALE"],
                      ["custom", "NEUTRAL"],
                    ] as Array<[Gender, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={gender === value ? "active" : ""}
                      onClick={() => setGender(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="field">
              <span>PASSWORD</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                autoComplete={tab === "create" ? "new-password" : "current-password"}
                required
              />
            </label>

            {tab === "create" && (
              <label className="field">
                <span>CONFIRM PASSWORD</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Type it again"
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </label>
            )}

            {error && <div className="form-error">{error}</div>}

            <button className="btn btn-primary btn-block auth-submit" disabled={busy}>
              {busy
                ? "CHECKING CREDENTIALS…"
                : tab === "create"
                  ? "CREATE OPERATOR →"
                  : "ENTER SITE →"}
            </button>
          </form>

          <p className="auth-fine">
            Accounts are saved locally on this device. {GAME.shortName} is a{" "}
            {BBT.name} game.
          </p>
        </section>
      </main>

      <StudioFooter />
    </div>
  );
}
