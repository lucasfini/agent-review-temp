import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

export interface AudioExtractionState {
  isReady: boolean;
  error: string | null;
}

export const useAudioExtractor = () => {
  const [state, setState] = useState<AudioExtractionState>({
    isReady: false,
    error: null,
  });
  
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const load = useCallback(async () => {
    if (ffmpegRef.current) return;

    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      // Load ffmpeg.wasm from unpkg CDN
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setState(prev => ({ ...prev, isReady: true, error: null }));
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to initialize audio processor. Please try again.',
        isReady: false 
      }));
    }
  }, []);

  const extractAudio = useCallback(async (
    videoFile: File, 
    onProgress?: (progress: number) => void
  ): Promise<File> => {
    if (!ffmpegRef.current) {
      await load();
    }
    
    // Double check loading state
    if (!ffmpegRef.current?.loaded) {
        // If load() was called but hasn't finished, we might need to wait or it failed.
        // For simplicity, we assume load() awaits success or throws.
        // If it failed previously, state.error would be set.
       if (!ffmpegRef.current?.loaded) throw new Error('FFmpeg not loaded');
    }

    const ffmpeg = ffmpegRef.current;
    
    // Progress handler wrapper
    const progressHandler = ({ progress }: { progress: number }) => {
        if (onProgress) onProgress(Math.round(progress * 100));
    };

    ffmpeg.on('progress', progressHandler);

    try {
      const inputName = 'input' + getFileExtension(videoFile.name);
      const outputName = 'output.mp3';

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // -vn: Disable video recording
      // -acodec libmp3lame: Use MP3 codec
      // -q:a 2: High quality variable bit rate
      // -map a: Map audio streams only
      await ffmpeg.exec(['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outputName]);

      const data = await ffmpeg.readFile(outputName);
      
      // Cleanup
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      const audioBlob = new Blob([data as any], { type: 'audio/mp3' });
      const audioFile = new File([audioBlob], videoFile.name.replace(/\.[^/.]+$/, "") + ".mp3", {
        type: 'audio/mp3',
        lastModified: Date.now(),
      });

      return audioFile;

    } catch (error) {
      console.error('Audio extraction failed:', error);
      throw error;
    } finally {
        ffmpeg.off('progress', progressHandler);
    }
  }, [load]);

  return {
    extractAudio,
    isReady: state.isReady,
    error: state.error
  };
};

function getFileExtension(filename: string) {
  const parts = filename.split('.');
  return parts.length > 1 ? '.' + parts.pop() : '';
}
