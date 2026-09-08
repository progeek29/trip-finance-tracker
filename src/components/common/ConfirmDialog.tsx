import React from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** App-styled delete confirm: "Are you sure?" + red Delete + X. No Cancel, no native popup. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  message,
  confirmLabel,
  onConfirm,
  onClose,
}) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
    <div className="relative bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 w-[300px] text-center space-y-4">
      <button onClick={onClose} className="absolute right-3 top-3 p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer" title="Close">
        <X size={16} />
      </button>
      <p className="text-sm font-extrabold text-slate-900 pt-1">Are you sure?</p>
      <p className="text-xs text-slate-500 font-medium">{message}</p>
      <button
        onClick={() => {
          onConfirm();
          onClose();
        }}
        className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
      >
        {confirmLabel || 'Delete'}
      </button>
    </div>
  </div>
);
