"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_CUSTOMIZATION,
  type Account,
  type Customization,
  type FaceKind,
  type Gender,
  type HatKind,
} from "@/lib/types";
import AvatarPreview from "./AvatarPreview";
import { BrandMark, StudioFooter } from "./BrandMark";

type Tab = "body" | "outfit" | "head" | "face";

const SKINS = ["#f2c9a3", "#e8b589", "#c98d5f", "#a56843", "#8d5a3a", "#6d432c", "#4a2c1d"];
const SHIRTS = ["#ff7a1a", "#ffb51e", "#e24836", "#3c78b4", "#4f9d6a", "#6f63b8", "#e8e4d8", "#2a3038"];
const PANTS = ["#394b66", "#2e343c", "#54523e", "#6f6046", "#3d3348", "#334d44", "#7a3d2c", "#20242a"];
const SHOES = ["#22262e", "#3d2d24", "#e8e4d8", "#2e4a63", "#4a2f2a", "#1b1c21"];
const HAT_COLORS = ["#ffc21c", "#f0ede2", "#ff7a1a", "#3c78b4", "#2a3038", "#e24836"];

const PRESETS: Array<{ name: string; note: string; customization: Customization }> = [
  {
    name: "SITE CREW",
    note: "Standard issue",
    customization: { ...DEFAULT_CUSTOMIZATION },
  },
  {
    name: "NIGHT SHIFT",
    note: "Low light, high vis",
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      skin: "#c98d5f",
      shirt: "#2a3038",
      pants: "#20242a",
      shoes: "#1b1c21",
      hat: "beanie",
      hatColor: "#ff7a1a",
      face: "focused",
    },
  },
  {
    name: "SURVEYOR",
    note: "Blueprint ready",
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      body: "female",
      skin: "#f2c9a3",
      shirt: "#3c78b4",
      pants: "#54523e",
      shoes: "#3d2d24",
      hat: "cap",
      hatColor: "#f0ede2",
      face: "happy",
    },
  },
  {
    name: "FOREMAN",
    note: "Runs the tower",
    customization: {
      ...DEFAULT_CUSTOMIZATION,
      skin: "#8d5a3a",
      shirt: "#ffb51e",
      pants: "#394b66",
      shoes: "#22262e",
      hat: "hardhat",
      hatColor: "#ff7a1a",
      face: "confident",
    },
  },
];

function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="studio-control">
      <div className="studio-control-head">
        <span>{label}</span>
        <code>{value.toUpperCase()}</code>
      </div>
      <div className="swatch-row">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className={`swatch${value === color ? " active" : ""}`}
            style={{ background: color }}
            aria-label={`${label} ${color}`}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}

function OptionGrid<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string; note?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="studio-control">
      <div className="studio-control-head">
        <span>{label}</span>
      </div>
      <div className="option-grid">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`option-tile${value === option.id ? " active" : ""}`}
            onClick={() => onChange(option.id)}
          >
            <strong>{option.label}</strong>
            {option.note && <small>{option.note}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CharacterStudio({
  account,
  firstRun,
  onSave,
  onBack,
}: {
  account: Account;
  firstRun: boolean;
  onSave: (account: Account) => void;
  onBack: () => void;
}) {
  const [customization, setCustomization] = useState<Customization>({
    ...DEFAULT_CUSTOMIZATION,
    ...account.customization,
  });
  const [tab, setTab] = useState<Tab>("body");

  const patch = (next: Partial<Customization>) =>
    setCustomization((current) => ({ ...current, ...next }));

  const headshot = useMemo(() => {
    // The 3D preview owns the visual; this gradient is a lightweight fallback.
    const body = customization.body === "female" ? "women" : "men";
    return `${body} / ${customization.shirt} / ${customization.hat}`;
  }, [customization]);

  function randomize() {
    const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
    const preset = pick(PRESETS).customization;
    setCustomization({
      ...preset,
      body: pick<Gender>(["male", "female", "custom"]),
      skin: pick(SKINS),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      shoes: pick(SHOES),
      hat: pick<HatKind>(["hardhat", "cap", "beanie", "none"]),
      hatColor: pick(HAT_COLORS),
      face: pick<FaceKind>(["confident", "happy", "focused"]),
    });
  }

  function save() {
    onSave({
      ...account,
      gender: customization.body,
      customization,
    });
  }

  return (
    <div className="screen studio-screen">
      <div className="studio-blueprint" aria-hidden="true" />
      <header className="site-header">
        <BrandMark />
        <div className="site-header-title">
          <span>OPERATOR STUDIO</span>
          <strong>BUILD YOUR CREW MEMBER</strong>
        </div>
        <button type="button" className="btn btn-ghost" onClick={firstRun ? save : onBack}>
          {firstRun ? "SKIP FOR NOW" : "← BACK"}
        </button>
      </header>

      <main className="studio-main">
        <section className="studio-preview-panel">
          <div className="studio-preview-head">
            <span className="eyebrow">LIVE PREVIEW</span>
            <strong>{account.nickname}</strong>
          </div>
          <AvatarPreview customization={customization} />
          <div className="studio-preview-meta">
            <span>{headshot}</span>
            <span>DRAG TO ROTATE</span>
          </div>
          <div className="studio-presets">
            <span className="eyebrow">QUICK PRESETS</span>
            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className="preset-card"
                  onClick={() => setCustomization({ ...preset.customization })}
                >
                  <i style={{ background: preset.customization.shirt }} />
                  <span>
                    <strong>{preset.name}</strong>
                    <small>{preset.note}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="studio-controls panel">
          <div className="studio-tabs">
            {(
              [
                ["body", "BODY"],
                ["outfit", "OUTFIT"],
                ["head", "HEAD"],
                ["face", "FACE"],
              ] as Array<[Tab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="studio-tab-body">
            {tab === "body" && (
              <>
                <OptionGrid
                  label="BODY TYPE"
                  value={customization.body}
                  options={[
                    { id: "male", label: "MALE", note: "Broad frame" },
                    { id: "female", label: "FEMALE", note: "Athletic frame" },
                    { id: "custom", label: "NEUTRAL", note: "Standard frame" },
                  ]}
                  onChange={(body) => patch({ body })}
                />
                <Swatches
                  label="SKIN TONE"
                  colors={SKINS}
                  value={customization.skin}
                  onChange={(skin) => patch({ skin })}
                />
                <div className="studio-note">
                  <strong>SITE READY.</strong> Every operator starts with the same
                  ten points, a carbine, a sidearm and a utility knife. Armour and
                  extra points are only granted to the Lone Wolf.
                </div>
              </>
            )}

            {tab === "outfit" && (
              <>
                <Swatches
                  label="SHIRT / HIGH-VIS"
                  colors={SHIRTS}
                  value={customization.shirt}
                  onChange={(shirt) => patch({ shirt })}
                />
                <Swatches
                  label="PANTS"
                  colors={PANTS}
                  value={customization.pants}
                  onChange={(pants) => patch({ pants })}
                />
                <Swatches
                  label="BOOTS"
                  colors={SHOES}
                  value={customization.shoes}
                  onChange={(shoes) => patch({ shoes })}
                />
              </>
            )}

            {tab === "head" && (
              <>
                <OptionGrid
                  label="HEADWEAR"
                  value={customization.hat}
                  options={[
                    { id: "hardhat", label: "HARD HAT", note: "Site standard" },
                    { id: "cap", label: "SITE CAP", note: "Crew issue" },
                    { id: "beanie", label: "BEANIE", note: "Night shift" },
                    { id: "none", label: "NONE", note: "Bare head" },
                  ]}
                  onChange={(hat) => patch({ hat })}
                />
                <Swatches
                  label="HEADWEAR COLOUR"
                  colors={HAT_COLORS}
                  value={customization.hatColor}
                  onChange={(hatColor) => patch({ hatColor })}
                />
              </>
            )}

            {tab === "face" && (
              <OptionGrid
                label="EXPRESSION"
                value={customization.face}
                options={[
                  { id: "confident", label: "CONFIDENT", note: "Locked in" },
                  { id: "focused", label: "FOCUSED", note: "On target" },
                  { id: "happy", label: "HAPPY", note: "Here for it" },
                ]}
                onChange={(face) => patch({ face })}
              />
            )}
          </div>

          <div className="studio-actions">
            <button type="button" className="btn btn-ghost" onClick={randomize}>
              RANDOMISE
            </button>
            <button type="button" className="btn btn-primary" onClick={save}>
              {firstRun ? "ENTER SITE →" : "SAVE OPERATOR"}
            </button>
          </div>
        </section>
      </main>

      <StudioFooter />
    </div>
  );
}
