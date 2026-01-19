'use client';

import { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, User } from 'lucide-react';

export interface RosterSpeaker {
  id: string;
  name: string;
  role: 'host' | 'guest' | 'cohost' | 'moderator' | 'other' | null;
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
          <h3 className="text-sm font-semibold text-gray-800">
            Speaker Roster (Optional)
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Pre-define speaker names to improve accuracy and save editing time
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          type="button"
          className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
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
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white shadow-sm">
          {/* Existing speakers */}
          {speakers.length > 0 && (
            <div className="space-y-3">
              {speakers.map((speaker, index) => (
                <div key={speaker.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
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
                        className="text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />

                      <select
                        value={speaker.role || ''}
                        onChange={(e) => updateSpeaker(speaker.id, { role: e.target.value as any || null })}
                        className="text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Role (optional)</option>
                        <option value="host">Host</option>
                        <option value="guest">Guest</option>
                        <option value="cohost">Co-host</option>
                        <option value="moderator">Moderator</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <input
                      type="text"
                      value={speaker.description || ''}
                      onChange={(e) => updateSpeaker(speaker.id, { description: e.target.value })}
                      placeholder="Description (optional, e.g., 'CEO of TechCorp')"
                      className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <button
                    onClick={() => removeSpeaker(speaker.id)}
                    type="button"
                    className="flex-shrink-0 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
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
              className="w-full border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              <User className="w-4 h-4" />
              Add Speaker ({speakers.length}/10)
            </button>
          )}

          {/* Helper text */}
          {speakers.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-blue-600 mt-0.5">💡</div>
              <p className="text-xs text-blue-700">
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
