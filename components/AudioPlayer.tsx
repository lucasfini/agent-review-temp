"use client";

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Play, Pause, Volume1, Volume2, VolumeX } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  audioElementRef: RefObject<HTMLAudioElement | null>;
  headerToggle?: ReactNode;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Deterministic LCG waveform — seeded on src string, stable across renders
function generateWaveform(seed: string, count = 80): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  let state = (h >>> 0) || 1;
  return Array.from({ length: count }, (_, i) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const pos = i / (count - 1);
    const envelope = 0.4 + 0.6 * Math.sin(pos * Math.PI);
    const noise = state / 0xffffffff;
    return 0.15 + envelope * noise * 0.85;
  });
}

const SPEEDS = [1, 1.2, 1.5, 2];

export function AudioPlayer({ src, audioElementRef, headerToggle }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [playError, setPlayError] = useState<string | null>(null);

  // Direct DOM refs — zero re-renders during playback
  const playedOverlayRef = useRef<HTMLDivElement>(null);
  const chipTimeRef = useRef<HTMLSpanElement>(null);
  const chipDurRef = useRef<HTMLSpanElement>(null);
  const tooltipWrapperRef = useRef<HTMLDivElement>(null);
  const tooltipTextRef = useRef<HTMLSpanElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef(0);

  const bars = generateWaveform(src);

  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio) return;

    // Reset UI for new track
    setIsPlaying(false);
    setPlayError(null);
    durationRef.current = 0;
    if (playedOverlayRef.current) playedOverlayRef.current.style.clipPath = 'inset(0 100% 0 0)';
    if (chipTimeRef.current) chipTimeRef.current.textContent = '0:00';
    if (chipDurRef.current) chipDurRef.current.textContent = '--:--';

    const onTimeUpdate = () => {
      const t = audio.currentTime;
      const d = durationRef.current || audio.duration || 0;
      if (chipTimeRef.current) chipTimeRef.current.textContent = fmt(t);
      if (playedOverlayRef.current && d) {
        const pct = (t / d) * 100;
        playedOverlayRef.current.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      }
    };

    const onLoadedMetadata = () => {
      durationRef.current = audio.duration;
      if (chipDurRef.current) chipDurRef.current.textContent = fmt(audio.duration);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      if (chipTimeRef.current) chipTimeRef.current.textContent = '0:00';
      if (playedOverlayRef.current) playedOverlayRef.current.style.clipPath = 'inset(0 100% 0 0)';
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('playing', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('playing', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioElementRef, src]);

  const togglePlay = () => {
    const audio = audioElementRef.current;
    if (!audio) return;
    setPlayError(null);
    if (audio.paused) {
      audio.play().catch((err: Error) => {
        if (err.name === 'NotAllowedError') setPlayError('Click to allow playback');
        else if (err.name === 'NotSupportedError') setPlayError('Audio format not supported');
        else setPlayError('Playback failed');
      });
    } else {
      audio.pause();
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioElementRef.current;
    const container = waveformContainerRef.current;
    if (!audio || !container || !durationRef.current) return;
    const rect = container.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * durationRef.current;
  };

  const handleWaveformMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = waveformContainerRef.current;
    const tooltipWrapper = tooltipWrapperRef.current;
    const tooltipText = tooltipTextRef.current;
    if (!container || !tooltipWrapper || !tooltipText || !durationRef.current) return;
    const rect = container.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    tooltipText.textContent = fmt(pct * durationRef.current);
    tooltipWrapper.style.left = `${e.clientX - rect.left}px`;
    tooltipWrapper.style.opacity = '1';
  };

  const handleWaveformMouseLeave = () => {
    if (tooltipWrapperRef.current) tooltipWrapperRef.current.style.opacity = '0';
  };

  const cycleSpeed = () => {
    const audio = audioElementRef.current;
    const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(nextSpeed);
    if (audio) audio.playbackRate = nextSpeed;
  };

  const toggleMute = () => {
    const audio = audioElementRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioElementRef.current;
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audio) {
      audio.volume = v;
      audio.muted = v === 0;
      setIsMuted(v === 0);
    }
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex-shrink-0 flex flex-col gap-1.5 border-b border-slate-200 bg-white px-4 pt-2.5 pb-2 select-none dark:border-slate-800 dark:bg-slate-950">
      {/* Hidden audio element — ref forwarded from parent */}
      <audio ref={audioElementRef} src={src} preload="metadata" className="hidden" crossOrigin="anonymous" />

      {headerToggle ? (
        <div className="flex justify-end pb-1">
          {headerToggle}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors text-white"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? <Pause className="w-3 h-3 fill-current" />
            : <Play className="w-3 h-3 fill-current ml-0.5" />
          }
        </button>

        {/* Waveform + hover tooltip */}
        <div className="relative flex-1">
          {/* Tooltip — positioned via direct DOM writes */}
          <div
            ref={tooltipWrapperRef}
            className="absolute bottom-full mb-1.5 pointer-events-none opacity-0 transition-opacity duration-100"
            style={{ transform: 'translateX(-50%)' }}
          >
            <span
              ref={tooltipTextRef}
              className="block whitespace-nowrap rounded-full border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-md shadow-slate-300/60 backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-200 dark:shadow-black/40"
            >
              0:00
            </span>
          </div>

          {/* Waveform bars */}
          <div
            ref={waveformContainerRef}
            className="relative flex items-end h-8 gap-px cursor-pointer"
            onClick={handleWaveformClick}
            onMouseMove={handleWaveformMouseMove}
            onMouseLeave={handleWaveformMouseLeave}
            role="button"
            aria-label="Seek audio"
          >
            {/* Unplayed bars (grey) */}
            {bars.map((h, i) => (
              <div
                key={i}
                className="pointer-events-none flex-1 rounded-sm bg-slate-300/70 dark:bg-slate-700/50"
                style={{ height: `${h * 100}%` }}
              />
            ))}

            {/* Played overlay (blue gradient, clip-path updated via ref) */}
            <div
              ref={playedOverlayRef}
              className="absolute inset-0 flex items-end gap-px pointer-events-none"
              style={{ clipPath: 'inset(0 100% 0 0)' }}
            >
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-gradient-to-t from-blue-500 to-indigo-400"
                  style={{ height: `${h * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Speed + time chip */}
        <button
          onClick={cycleSpeed}
          className="flex-shrink-0 flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 transition-colors hover:bg-slate-200 dark:border-slate-700/80 dark:bg-slate-800 dark:hover:bg-slate-700"
          title="Toggle playback speed"
        >
          <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">{speed === 1 ? '1×' : `${speed}×`}</span>
          <span className="mx-0.5 text-[10px] text-slate-400 dark:text-slate-600">•</span>
          <span ref={chipTimeRef} className="text-[10px] font-mono tabular-nums text-slate-700 dark:text-slate-400">0:00</span>
          <span className="mx-0.5 text-[10px] text-slate-400 dark:text-slate-600">/</span>
          <span ref={chipDurRef} className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-600">--:--</span>
        </button>

        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          className="flex-shrink-0 text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          <VolumeIcon className="w-3.5 h-3.5" />
        </button>

        {/* Volume slider */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-14 h-1 cursor-pointer accent-blue-500"
          aria-label="Volume"
        />
      </div>

      {/* Error message */}
      {playError && (
        <p className="pb-0.5 text-center text-[11px] text-amber-600 dark:text-amber-400">{playError}</p>
      )}
    </div>
  );
}
