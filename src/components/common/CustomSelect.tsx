import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
}

/** App-styled dropdown (replaces basic native selects). */
export const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, placeholder, label }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <div>
      {label && <label className="block text-[11px] font-bold text-slate-700 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 flex items-center justify-between gap-2 hover:bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 cursor-pointer"
      >
        <span className="truncate">{current ? current.label : <span className="text-slate-400">{placeholder || 'Select'}</span>}</span>
        <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-[300px] max-h-[60vh] overflow-y-auto p-1.5">
            {options.map((o) => {
              const sel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-left cursor-pointer ${
                    sel ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className={`block text-[10px] truncate font-medium ${sel ? 'text-indigo-100' : 'text-slate-400'}`}>{o.hint}</span>}
                  </span>
                  {sel && <Check size={14} className="flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
