import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { TripTodo } from '../../types';

interface TodoViewProps {
  todos: TripTodo[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

/** Trip checklist as its own tab: pending on top, done below. */
export const TodoView: React.FC<TodoViewProps> = ({ todos, onAddTodo, onToggleTodo, onDeleteTodo }) => {
  const [todoText, setTodoText] = useState('');
  const pending = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  const submit = () => {
    if (!todoText.trim()) return;
    onAddTodo(todoText);
    setTodoText('');
  };

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 font-display">Trip Checklist</h3>
        <span className="text-xs text-slate-500 font-medium">{done.length}/{todos.length} done</span>
      </div>
      <div className="clean-card rounded-2xl p-3.5 border border-slate-200 bg-white space-y-2">
        <div className="flex gap-2">
          <input
            value={todoText}
            onChange={(e) => setTodoText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="e.g. Buy sunscreen, meet Rohan at station"
            className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 placeholder-slate-400"
          />
          <button
            onClick={submit}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer flex-shrink-0"
          >
            Add
          </button>
        </div>
        <div className="space-y-1.5">
          {pending.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
              <button
                onClick={() => onToggleTodo(t.id)}
                className="w-6 h-6 rounded-lg border-2 border-slate-300 text-transparent hover:border-emerald-500 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
                title="Mark done"
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 6.5L4.8 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <span className="flex-1 min-w-0 text-xs font-semibold truncate text-slate-800">{t.text}</span>
              <button onClick={() => onDeleteTodo(t.id)} className="p-1 rounded-lg text-slate-300 hover:text-rose-500 cursor-pointer" title="Delete">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {pending.length === 0 && todos.length > 0 && (
            <p className="text-[11px] text-emerald-600 font-bold text-center py-1">All done — trip ready.</p>
          )}
          {done.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1 pb-1">
                Done ({done.length})
              </p>
              <div className="space-y-1.5">
                {done.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 bg-emerald-50/60 rounded-xl px-3 py-2 border border-emerald-100">
                    <button
                      onClick={() => onToggleTodo(t.id)}
                      className="w-6 h-6 rounded-lg bg-emerald-500 border-2 border-emerald-500 text-white flex items-center justify-center flex-shrink-0 cursor-pointer"
                      title="Mark not done"
                    >
                      <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 6.5L4.8 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <span className="flex-1 min-w-0 text-xs font-semibold truncate line-through text-slate-400">{t.text}</span>
                    <button onClick={() => onDeleteTodo(t.id)} className="p-1 rounded-lg text-slate-300 hover:text-rose-500 cursor-pointer" title="Delete">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {todos.length === 0 && (
            <p className="text-[11px] text-slate-400 text-center py-2">Nothing here — add the small things so they don't get forgotten.</p>
          )}
        </div>
      </div>
    </div>
  );
};
