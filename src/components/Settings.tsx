import { Check } from "lucide-react";
import Dialog from "./Dialog";
import type { Settings as Preferences } from "../lib/store";
export default function Settings({
  settings,
  setSettings,
  onClose,
  onBack,
}: {
  settings: Preferences;
  setSettings: (s: Preferences) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  const toggle = (key: "sound" | "motion" | "contrast" | "transparency") =>
    setSettings({ ...settings, [key]: !settings[key] });
  return (
    <Dialog title="Settings" onClose={onClose} onBack={onBack}>
      <label className="name-setting">
        <span>
          <strong>Your name</strong>
          <input
            maxLength={20}
            value={settings.name}
            onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            placeholder="Player 1"
            autoComplete="nickname"
          />
        </span>
      </label>
      <div className="settings-group">
        {(
          [
            ["sound", "Game sounds", "Sounds for shots and wins."],
            ["motion", "Reduce motion", "Fewer animations."],
            ["contrast", "Increase contrast", "Bolder text and outlines."],
            ["transparency", "Reduce transparency", "Solid backgrounds."],
          ] as const
        ).map(([key, title, description]) => (
          <div className="setting-row" key={key}>
            <div>
              <strong id={`${key}-title`}>{title}</strong>
              <p id={`${key}-description`}>{description}</p>
            </div>
            <button
              role="switch"
              aria-checked={Boolean(settings[key])}
              aria-labelledby={`${key}-title`}
              aria-describedby={`${key}-description`}
              onClick={() => toggle(key)}
              className={`switch ${settings[key] ? "on" : ""}`}
            >
              <span>{settings[key] && <Check size={12} />}</span>
            </button>
          </div>
        ))}
      </div>
      <p className="privacy-note">
        Saved on this device only. No account needed.
      </p>
      <button className="primary-button full-width" onClick={onClose}>
        Done
      </button>
    </Dialog>
  );
}
