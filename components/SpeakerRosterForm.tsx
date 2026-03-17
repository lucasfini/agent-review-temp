'use client';

import { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, User } from 'lucide-react';
import { type SpeakerRole, SPEAKER_ROLE_LABELS, SPEAKER_ROLES } from '@/lib/types';

export interface RosterSpeaker {
  id: string;
  name: string;
  role: SpeakerRole | null;
  description?: string;
  priority: number;
}

interface SpeakerRosterFormProps {
  speakers: RosterSpeaker[];
  onChange: (speakers: RosterSpeaker[]) => void;
}

export function SpeakerRosterForm({ speakers, onChange }: SpeakerRosterFormProps) {
  const [showForm, setShowForm] = useState(false);

  const addSpeaker = () => {
    const newSpeaker: RosterSpeaker = {
      id: crypto.randomUUID(),
      name: '',
      role: null,
      description: '',
      priority: speakers.length + 1
    };
    onChange([...speakers, newSpeaker]);
    setShowForm(true);
  };

  const updateSpeaker = (id: string, updates: Partial<RosterSpeaker>) => {
    onChange(
      speakers.map(s => s.id === id ? { ...s, ...updates } : s)
    );
  };

  const removeSpeaker = (id: string) => {
    const filtered = speakers.filter(s => s.id !== id);
    // Recalculate priorities
    onChange(filtered.map((s, index) => ({ ...s, priority: index + 1 })));
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Speaker Roster (Optional)
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Pre-define speaker names to improve accuracy and save editing time
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          type="button"
          className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-400 font-medium"
        >
          {showForm ? (
            <>
              Hide <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              {speakers.length === 0 ? 'Add Speakers' : `View Speakers (${speakers.length})`}
              <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {/* Existing speakers */}
          {speakers.length > 0 && (
            <div className="space-y-3">
              {speakers.map((speaker, index) => (
                <div key={speaker.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={speaker.name}
                        onChange={(e) => updateSpeaker(speaker.id, { name: e.target.value })}
                        placeholder="Full Name *"
                        className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        required
                      />

                      <select
                        value={speaker.role || ''}
                        onChange={(e) => updateSpeaker(speaker.id, { role: e.target.value as any || null })}
                        className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">Role (optional)</option>
                        {SPEAKER_ROLES.map(role => (
                          <option key={role} value={role}>{SPEAKER_ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text"
                      value={speaker.description || ''}
                      onChange={(e) => updateSpeaker(speaker.id, { description: e.target.value })}
                      placeholder="Description (optional, e.g., 'CEO of TechCorp')"
                      className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <button
                    onClick={() => removeSpeaker(speaker.id)}
                    type="button"
                    className="flex-shrink-0 rounded p-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    title="Remove speaker"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add speaker button */}
          {speakers.length < 10 && (
            <button
              onClick={addSpeaker}
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-blue-900/20 dark:hover:text-blue-600"
            >
              <User className="w-4 h-4" />
              Add Speaker ({speakers.length}/10)
            </button>
          )}

          {/* Helper text */}
          {speakers.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/30 dark:bg-blue-900/20">
              <div className="text-blue-600 mt-0.5">💡</div>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                <strong>Tip:</strong> Add speakers in order of appearance. The host should typically be first, followed by guests.
                This helps improve automatic matching accuracy.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
