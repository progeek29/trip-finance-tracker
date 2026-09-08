import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';

interface DatePickerProps {
  value: string; // 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm' when withTime
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  withTime?: boolean;
  small?: boolean;
  placeholder?: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseDatePart(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

function parseTimePart(v: string): { h: number; min: number } {
  const m = /T(\d{2}):(\d{2})/.exec(v || '');
  if (!m) return { h: 9, min: 0 };
  return { h: +m[1], min: +m[2] };
}

function formatDisplay(v: string, withTime?: boolean): string {
  if (!v) return '';
  if (withTime && v.includes('T')) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const p = parseDatePart(v);
  if (!p) return v;
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Custom calendar date picker styled with the app UI (no native calendar). */
export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  withTime,
  small,
  placeholder,
}) => {
  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(2026);
  const [viewM, setViewM] = useState(8);
  const [timeH, setTimeH] = useState(9);
  const [timeMin, setTimeMin] = useState(0);

  const openPicker = () => {
    const p = parseDatePart(value);
    const now = new Date();
    setViewY(p ? p.y : now.getFullYear());
    setViewM(p ? p.m - 1 : now.getMonth());
    const t = parseTimePart(value);
    setTimeH(t.h);
    setTimeMin(t.min);
    setOpen(true);
  };

  const minDay = min ? min.slice(0, 10) : undefined;
  const maxDay = max ? max.slice(0, 10) : undefined;
  const selectedDay = value ? value.slice(0, 10) : '';
  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  })();

  const shiftMonth = (dir: number) => {
    let m = viewM + dir;
    let y = viewY;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewM(m);
    setViewY(y);
  };

  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const leadBlanks = (new Date(viewY, viewM, 1).getDay() + 6) % 7; // Monday start
  const daysInPrevMonth = new Date(viewY, viewM, 0).getDate();
  // Fixed 6-row grid (42 cells) — same calendar size every month, no jumping
  const cells: { day: number; monthOffset: -1 | 0 | 1 }[] = [];
  for (let i = leadBlanks - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, monthOffset: -1 });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, monthOffset: 0 });
  let next = 1;
  while (cells.length < 42) {
    cells.push({ day: next++, monthOffset: 1 });
  }

  const dateStrFor = (c: { day: number; monthOffset: -1 | 0 | 1 }) => {
    let m = viewM + c.monthOffset;
    let y = viewY;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    return `${y}-${pad(m + 1)}-${pad(c.day)}`;
  };

  const pickDay = (ds: string) => {
    if (withTime) {
      onChange(`${ds}T${pad(timeH)}:${pad(timeMin)}`);
    } else {
      onChange(ds);
      setOpen(false);
    }
  };

  const applyTime = () => {
    const ds = selectedDay || todayStr;
    onChange(`${ds}T${pad(timeH)}:${pad(timeMin)}`);
    setOpen(false);
  };

  const shown = formatDisplay(value, withTime);

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={`w-full rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 flex items-center justify-between gap-2 cursor-pointer hover:bg-white transition-colors ${
          small ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs font-semibold'
        }`}
      >
        <span className={shown ? 'font-semibold' : 'text-slate-400 font-medium'}>
          {shown || placeholder || (withTime ? 'Select date & time' : 'Select date')}
        </span>
        <CalendarIcon size={small ? 13 : 15} className="text-indigo-500 flex-shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-3xl border border-slate-200 shadow-2xl p-4 w-[300px]">
            {/* Month header */}
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-extrabold text-slate-900">
                {MONTHS[viewM]} <span className="text-indigo-600">{viewY}</span>
              </span>
              <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-center text-[10px] font-bold text-slate-400 py-1">{w}</span>
              ))}
            </div>

            {/* Days — fixed 42 cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((c, i) => {
                const ds = dateStrFor(c);
                const disabled = Boolean((minDay && ds < minDay) || (maxDay && ds > maxDay));
                const isSel = ds === selectedDay;
                const isToday = ds === todayStr;
                const dim = c.monthOffset !== 0;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickDay(ds)}
                    className={`aspect-square rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                      isSel
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : disabled
                          ? 'text-slate-300 cursor-not-allowed'
                          : isToday
                            ? 'text-indigo-700 ring-1 ring-indigo-400 hover:bg-indigo-50'
                            : dim
                              ? 'text-slate-300 hover:bg-slate-50 hover:text-slate-500'
                              : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
                    }`}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>

            {/* Time row */}
            {withTime && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <Clock size={14} className="text-indigo-500 flex-shrink-0" />
                <select
                  value={timeH}
                  onChange={(e) => setTimeH(+e.target.value)}
                  className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>{pad(h)}:00</option>
                  ))}
                </select>
                <span className="text-slate-400 font-bold">:</span>
                <select
                  value={timeMin}
                  onChange={(e) => setTimeMin(+e.target.value)}
                  className="flex-1 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <option key={m} value={m}>{pad(m)} min</option>
                  ))}
                </select>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const n = new Date();
                    setViewY(n.getFullYear());
                    setViewM(n.getMonth());
                  }}
                  className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Today
                </button>
                {value && (
                  <button
                    type="button"
                    onClick={() => { onChange(''); setOpen(false); }}
                    className="text-[11px] font-bold text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              {withTime ? (
                <button
                  type="button"
                  onClick={applyTime}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                >
                  Set
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
