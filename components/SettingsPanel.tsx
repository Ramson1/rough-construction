"use client";

import { BBT, GAME } from "@/lib/brand";
import type { Settings } from "@/lib/types";

export default function SettingsPanel({
  open,
  settings,
  inMatch,
  onChange,
  onClose,
  onLeaveMatch,
}: {
  open: boolean;
  settings: Settings;
  inMatch: boolean;
  onChange: (settings: Settings) => void;
  onClose: () => void;
  onLeaveMatch?: () => void;
}) {
  if (!open) return null;

  const patch = (next: Partial<Settings>) => onChange({ ...settings, ...next });

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal-card settings-card">
        <div className="modal-head">
          <div>
            <span className="eyebrow">{GAME.shortName} · CONFIG</span>
            <h2>Settings</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-grid">
          <section className="settings-section">
            <h3>VIDEO</h3>
            <div className="field">
              <span>GRAPHICS QUALITY</span>
              <div className="segmented">
                {(["low", "medium", "high"] as Settings["graphics"][]).map((quality) => (
                  <button
                    key={quality}
                    type="button"
                    className={settings.graphics === quality ? "active" : ""}
                    onClick={() => patch({ graphics: quality })}
                  >
                    {quality.toUpperCase()}
                  </button>
                ))}
              </div>
              <small className="field-help">Applied immediately to the match renderer.</small>
            </div>
            <div className="field">
              <span>DEFAULT CAMERA</span>
              <div className="segmented">
                <button
                  type="button"
                  className={!settings.firstPerson ? "active" : ""}
                  onClick={() => patch({ firstPerson: false })}
                >
                  THIRD PERSON
                </button>
                <button
                  type="button"
                  className={settings.firstPerson ? "active" : ""}
                  onClick={() => patch({ firstPerson: true })}
                >
                  FIRST PERSON
                </button>
              </div>
              <small className="field-help">Press V during a match to toggle either way.</small>
            </div>
          </section>

          <section className="settings-section">
            <h3>AUDIO</h3>
            <label className="range-field">
              <span>MUSIC <b>{Math.round(settings.musicVolume * 100)}%</b></span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.musicVolume * 100)}
                onChange={(event) => patch({ musicVolume: Number(event.target.value) / 100 })}
              />
            </label>
            <label className="range-field">
              <span>SFX <b>{Math.round(settings.sfxVolume * 100)}%</b></span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.sfxVolume * 100)}
                onChange={(event) => patch({ sfxVolume: Number(event.target.value) / 100 })}
              />
            </label>
            <label className="range-field">
              <span>MOUSE SENSITIVITY <b>{settings.mouseSensitivity.toFixed(1)}×</b></span>
              <input
                type="range"
                min={2}
                max={30}
                value={Math.round(settings.mouseSensitivity * 10)}
                onChange={(event) =>
                  patch({ mouseSensitivity: Number(event.target.value) / 10 })
                }
              />
            </label>
            <p className="settings-note">
              All music and sound effects are generated live in the browser with Web Audio.
            </p>
          </section>

          <section className="settings-section settings-controls">
            <h3>CONTROLS</h3>
            <div className="keybind-grid">
              <span><kbd>W A S D</kbd> Move</span>
              <span><kbd>MOUSE</kbd> Aim</span>
              <span><kbd>LEFT CLICK</kbd> Fire</span>
              <span><kbd>RIGHT CLICK</kbd> Aim down sights</span>
              <span><kbd>SHIFT</kbd> Sprint</span>
              <span><kbd>CTRL / C</kbd> Crouch</span>
              <span><kbd>SPACE</kbd> Jump</span>
              <span><kbd>R</kbd> Reload</span>
              <span><kbd>1 2 3</kbd> Weapons</span>
              <span><kbd>V</kbd> Camera</span>
              <span><kbd>TAB</kbd> Scoreboard</span>
              <span><kbd>H / F1</kbd> Controls card</span>
              <span><kbd>ESC</kbd> Pause</span>
            </div>
          </section>
        </div>

        <div className="modal-foot">
          <span className="settings-studio">
            {GAME.shortName} · {BBT.name} · v{GAME.version}
          </span>
          <div className="modal-actions">
            {inMatch && onLeaveMatch && (
              <button type="button" className="btn btn-danger" onClick={onLeaveMatch}>
                LEAVE MATCH
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onClose}>
              RESUME
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
