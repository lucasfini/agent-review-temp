'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { SpeakerRow } from "./SpeakerRow";
import { useState, RefObject, useMemo } from "react";
import type { SpeakerSegment, SpeakerProfile } from "@/lib/types";
import type { AudioPlayerRef } from "@/lib/hooks/useSpeakerSample";
import { getSpeakerDisplayName } from "@/lib/name-extraction";

interface SpeakerManagerModalProps {
  // Accepts the raw speakerData object from your transcript
  speakerData: {
    segments: SpeakerSegment[];
    speakers: Record<string, any>;
  };
  audioPlayerRef: RefObject<AudioPlayerRef | null>;
  onRename: (speakerId: string, newName: string) => void;
}

export function SpeakerManagerModal({
  speakerData,
  audioPlayerRef,
  onRename,
}: SpeakerManagerModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Convert the speakers record to SpeakerProfile array
  const speakerProfiles: SpeakerProfile[] = useMemo(() => {
    return Object.entries(speakerData.speakers).map(([id, speaker]) => {
      // Calculate segment count and duration for this speaker
      const speakerSegments = speakerData.segments.filter(
        s => (s.finalSpeakerId || s.speakerId) === id
      );
      const totalDuration = speakerSegments.reduce(
        (sum, seg) => sum + (seg.endTime - seg.startTime),
        0
      );

      return {
        id,
        name: speaker.finalName || speaker.customName || speaker.extractedName?.name,
        fallbackName: speaker.fallbackName,
        displayName: getSpeakerDisplayName(speaker),
        role: speaker.role,
        totalDuration,
        segmentCount: speakerSegments.length,
        confidence: speaker.confidence,
        summary: speaker.roleSummary,
      };
    });
  }, [speakerData]);

  const speakerCount = speakerProfiles.length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="w-4 h-4" />
          Speakers ({speakerCount})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Speakers</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 mb-4">
          Click the play button to hear a sample of each speaker. Click a name to edit it.
        </p>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Sample</TableHead>
                <TableHead>Speaker Name</TableHead>
                <TableHead className="text-right w-24">Segments</TableHead>
                <TableHead className="text-right w-24">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {speakerProfiles.map((speaker) => (
                <SpeakerRow
                  key={speaker.id}
                  speaker={speaker}
                  segments={speakerData.segments}
                  audioPlayerRef={audioPlayerRef}
                  onRename={onRename}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {speakerCount === 0 && (
          <div className="text-center py-8 text-gray-500">
            No speakers detected in this transcript.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
