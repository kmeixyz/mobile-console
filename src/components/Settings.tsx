import { Check, Contrast, Gauge, Layers, Volume2 } from "lucide-react";
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
    <Dialog title="Settings" className="settings-sheet" onClose={onClose} onBack={onBack}>
      <div className="settings-group">
        {(
          [
            ["sound", "Sound", Volume2],
            ["motion", "Reduce motion", Gauge],
            ["contrast", "More contrast", Contrast],
            ["transparency", "Solid backgrounds", Layers],
          ] as const
        ).map(([key, title, Icon]) => (
          <div className="setting-row" key={key}>
            <div className="setting-label">
              <Icon size={22} aria-hidden="true" />
              <strong id={`${key}-title`}>{title}</strong>
            </div>
            <button
              role="switch"
              aria-checked={Boolean(settings[key])}
              aria-labelledby={`${key}-title`}
              onClick={() => toggle(key)}
              className={`switch ${settings[key] ? "on" : ""}`}
            >
              <span>{settings[key] && <Check size={12} />}</span>
            </button>
          </div>
        ))}
      </div>
      <button className="primary-button full-width" onClick={onClose}>
        Done
      </button>
    </Dialog>
  );
}
