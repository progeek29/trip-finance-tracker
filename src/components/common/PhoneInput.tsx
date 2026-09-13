import React from 'react';

interface PhoneInputProps {
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  icon?: React.ReactNode;
}

/** Digits only, max 10 (the +91 prefix is fixed). */
export function phoneDigits(value: string): string {
  const d = (value || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) return d.slice(-10);
  return d.slice(-10);
}

export function isValidPhone(value: string): boolean {
  return /^\d{10}$/.test(phoneDigits(value));
}

/** "+91 98765 43210" for display; raw value otherwise. */
export function formatPhoneDisplay(value: string | undefined): string {
  const d = phoneDigits(value || '');
  if (d.length !== 10) return value || '';
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({ value, onChange, placeholder, label, autoFocus, icon }) => {
  const digits = phoneDigits(value);
  const showError = digits.length > 0 && digits.length !== 10;

  return (
    <div>
      {label && <label className="block ui-label mb-1">{label}</label>}
      <div
        className={`flex items-center rounded-xl border bg-slate-50 focus-within:bg-white transition-colors overflow-hidden ${
          showError ? 'border-rose-300' : 'border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100'
        }`}
      >
        {icon && <span className="pl-3.5 flex items-center text-slate-400">{icon}</span>}
        <span className={`py-2.5 text-sm font-semibold text-slate-500 select-none ${icon ? 'pl-1.5 pr-2' : 'pl-3.5 pr-2'}`}>+91</span>
        <input
          type="tel"
          inputMode="numeric"
          autoFocus={autoFocus}
          value={digits}
          maxLength={10}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder={placeholder || 'Mobile number'}
          className="flex-1 min-w-0 bg-transparent py-2.5 pr-3.5 text-sm font-semibold text-slate-800 focus:outline-none placeholder-slate-300"
        />
      </div>
      {showError && <p className="text-[10px] text-rose-500 font-bold mt-1">Enter a 10-digit mobile number</p>}
    </div>
  );
};
