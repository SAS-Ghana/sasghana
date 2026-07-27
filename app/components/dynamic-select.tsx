import { useMemo, useState } from "react";

export type DynamicOption = { value: string; label: string };

export function DynamicSelect({
  label,
  value,
  options,
  onChange,
  required = false,
  allowOther = true,
  otherLabel = "Other",
  placeholder = "Select an option",
}: {
  label: string;
  value: string;
  options: DynamicOption[];
  onChange: (value: string) => void;
  required?: boolean;
  allowOther?: boolean;
  otherLabel?: string;
  placeholder?: string;
}) {
  const known = useMemo(() => options.some((option) => option.value === value), [options, value]);
  const [otherMode, setOtherMode] = useState(Boolean(value && !known));

  return (
    <label className="dynamic-select-field">
      <span>{label}</span>
      {!otherMode ? (
        <select
          value={known ? value : ""}
          required={required}
          onChange={(event) => {
            if (event.target.value === "__other__") {
              setOtherMode(true);
              onChange("");
            } else {
              onChange(event.target.value);
            }
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option value={option.value} key={option.value}>{option.label}</option>
          ))}
          {allowOther && <option value="__other__">{otherLabel}…</option>}
        </select>
      ) : (
        <div className="dynamic-other-input">
          <input
            autoFocus
            value={value}
            required={required}
            placeholder={`Type ${label.toLowerCase()}`}
            onChange={(event) => onChange(event.target.value)}
          />
          <button type="button" className="secondary" onClick={() => { setOtherMode(false); onChange(""); }}>
            Choose existing
          </button>
        </div>
      )}
    </label>
  );
}
