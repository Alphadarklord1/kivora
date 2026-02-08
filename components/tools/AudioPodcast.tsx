'use client';

import { useState, useEffect, useRef } from 'react';
import { extractTextFromFile } from '@/lib/pdf/extract';
import { idbStore } from '@/lib/idb';

interface Folder {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  name: string;
  folderId: string;
}

interface FileItem {
  id: string;
  name: string;
  type: string;
  content: string | null;
  localBlobId: string | null;
}

interface PiperVoice {
  id: string;
  name: string;
  language: string;
  quality: 'high' | 'medium' | 'low';
  description: string;
}

// Available Piper voices - prefer high quality for more natural sound
const PIPER_VOICES: PiperVoice[] = [
  { id: 'en_US-hfc_female-high', name: 'Sara (US)', language: 'en-US', quality: 'high', description: 'Natural female voice (HQ)' },
  { id: 'en_US-hfc_male-high', name: 'Ryan (US)', language: 'en-US', quality: 'high', description: 'Natural male voice (HQ)' },
  { id: 'en_US-amy-high', name: 'Amy (US)', language: 'en-US', quality: 'high', description: 'Clear American female (HQ)' },
  { id: 'en_US-ryan-high', name: 'Ryan (US Alt)', language: 'en-US', quality: 'high', description: 'Smooth American male (HQ)' },
  { id: 'en_US-lessac-high', name: 'Lessac (US)', language: 'en-US', quality: 'high', description: 'Expressive, studio‑style (HQ)' },
  { id: 'en_US-libritts_r-high', name: 'LibriTTS (US)', language: 'en-US', quality: 'high', description: 'Multi‑speaker, clear (HQ)' },
  { id: 'en_GB-alba-high', name: 'Alba (UK)', language: 'en-GB', quality: 'high', description: 'British female (HQ)' },
  { id: 'en_GB-semaine-high', name: 'Semaine (UK)', language: 'en-GB', quality: 'high', description: 'British accent (HQ)' },
  // Medium fallbacks
  { id: 'en_US-hfc_female-medium', name: 'Sara (US)', language: 'en-US', quality: 'medium', description: 'Natural female voice' },
  { id: 'en_US-hfc_male-medium', name: 'Ryan (US)', language: 'en-US', quality: 'medium', description: 'Natural male voice' },
  { id: 'en_US-amy-medium', name: 'Amy (US)', language: 'en-US', quality: 'medium', description: 'Clear American female' },
  { id: 'en_US-libritts_r-medium', name: 'LibriTTS (US)', language: 'en-US', quality: 'medium', description: 'Multi‑speaker, clear' },
  { id: 'en_GB-alba-medium', name: 'Alba (UK)', language: 'en-GB', quality: 'medium', description: 'British female' },
];

// Fallback Web Speech API voices
const WEB_SPEECH_PREMIUM = [
  'Google UK English Female',
  'Google UK English Male',
  'Google US English',
  'Microsoft Zira',
  'Microsoft David',
  'Samantha',
];

export function AudioPodcast() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string>('en_US-hfc_female-high');
  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // Piper TTS state
  const [piperLoaded, setPiperLoaded] = useState(false);
  const [piperLoading, setPiperLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadingVoice, setDownloadingVoice] = useState('');
  const [storedVoices, setStoredVoices] = useState<string[]>([]);
  const [useFallback, setUseFallback] = useState(false);

  // Web Speech fallback state
  const [webSpeechVoices, setWebSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedWebVoice, setSelectedWebVoice] = useState<string>('');

  // File system state
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [extractingFile, setExtractingFile] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const piperRef = useRef<typeof import('@mintplex-labs/piper-tts-web') | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Piper TTS
  useEffect(() => {
    const initPiper = async () => {
      try {
        const piper = await import('@mintplex-labs/piper-tts-web');
        piperRef.current = piper;

        // Check stored voices
        const stored = await piper.stored();
        setStoredVoices(stored);
        setPiperLoaded(true);
      } catch (err) {
        console.error('Failed to load Piper TTS:', err);
        setUseFallback(true);
      }
    };

    initPiper();

    // Load Web Speech voices as fallback
    const loadWebVoices = () => {
      const voices = speechSynthesis.getVoices();
      setWebSpeechVoices(voices);
      if (voices.length > 0 && !selectedWebVoice) {
        const premium = voices.find(v => WEB_SPEECH_PREMIUM.some(p => v.name.includes(p)));
        setSelectedWebVoice(premium?.name || voices[0].name);
      }
    };

    loadWebVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadWebVoices;
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [selectedWebVoice]);

  // Load folders on mount
  useEffect(() => {
    fetch('/api/folders', { credentials: 'include' })
      .then(res => res.ok ? res.json() : [])
      .then(data => setFolders(Array.isArray(data) ? data : []))
      .catch(() => setFolders([]));
  }, []);

  // Load topics when folder changes
  useEffect(() => {
    if (selectedFolder) {
      fetch(`/api/topics?folderId=${selectedFolder}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          setTopics(Array.isArray(data) ? data : []);
          setSelectedTopic('');
          setFiles([]);
        })
        .catch(() => {
          setTopics([]);
          setSelectedTopic('');
          setFiles([]);
        });
    } else {
      setTopics([]);
      setSelectedTopic('');
      setFiles([]);
    }
  }, [selectedFolder]);

  // Load files when topic changes
  useEffect(() => {
    if (selectedTopic) {
      setLoadingFiles(true);
      fetch(`/api/files?topicId=${selectedTopic}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          setFiles(Array.isArray(data) ? data : []);
          setLoadingFiles(false);
        })
        .catch(() => {
          setFiles([]);
          setLoadingFiles(false);
        });
    } else {
      setFiles([]);
    }
  }, [selectedTopic]);

  const handleSelectFile = async (file: FileItem) => {
    setExtractingFile(true);
    setError('');

    try {
      let content = '';

      if (file.type === 'upload' && file.localBlobId) {
        const blobData = await idbStore.get(file.localBlobId);
        if (blobData) {
          content = await extractTextFromFile(blobData.blob, blobData.name);
        } else {
          setError('File not found locally. It may have been uploaded on another device.');
          setExtractingFile(false);
          return;
        }
      } else if (file.content) {
        content = file.content;
      }

      if (content) {
        setText(content);
        setShowFileSelector(false);
      } else {
        setError('Could not extract text from file');
      }
    } catch {
      setError('Failed to extract text from file');
    } finally {
      setExtractingFile(false);
    }
  };

  const buildVoiceCandidates = (voiceId: string) => {
    const candidates = [voiceId];
    if (voiceId.endsWith('-high')) {
      candidates.push(voiceId.replace('-high', '-medium'));
      candidates.push(voiceId.replace('-high', '-low'));
    } else if (voiceId.endsWith('-medium')) {
      candidates.push(voiceId.replace('-medium', '-high'));
      candidates.push(voiceId.replace('-medium', '-low'));
    }
    return Array.from(new Set(candidates));
  };

  const downloadVoice = async (voiceId: string) => {
    if (!piperRef.current) return false;

    const candidates = buildVoiceCandidates(voiceId);
    setDownloadingVoice(voiceId);
    setDownloadProgress(0);

    try {
      let downloadedId: string | null = null;
      for (const candidate of candidates) {
        try {
          await piperRef.current.download(candidate, (progress: { loaded: number; total: number }) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            setDownloadProgress(percent);
          });
          downloadedId = candidate;
          break;
        } catch {
          // try next candidate
        }
      }

      const stored = await piperRef.current.stored();
      setStoredVoices(stored);
      setDownloadingVoice('');
      if (downloadedId && downloadedId !== voiceId) {
        setSelectedVoice(downloadedId);
      }
      return !!downloadedId;
    } catch (err) {
      console.error('Failed to download voice:', err);
      setDownloadingVoice('');
      return false;
    }
  };

  const generatePiperAudio = async (): Promise<Blob | null> => {
    if (!piperRef.current || !text.trim()) return null;

    // Check if voice is downloaded
    if (!storedVoices.includes(selectedVoice)) {
      const downloaded = await downloadVoice(selectedVoice);
      if (!downloaded) {
        setError('Failed to download voice model');
        return null;
      }
    }

    setIsGenerating(true);
    try {
      const wav = await piperRef.current.predict({
        text: text,
        voiceId: selectedVoice,
      });
      return wav;
    } catch (err) {
      console.error('Piper generation error:', err);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlay = async () => {
    if (!text.trim()) {
      setError('Please enter or paste some text first');
      return;
    }

    setError('');

    // Resume if paused
    if (isPaused) {
      if (useFallback) {
        speechSynthesis.resume();
        setIsPaused(false);
        setIsPlaying(true);
        startProgressTracking();
      } else if (audioRef.current) {
        audioRef.current.play();
        setIsPaused(false);
        setIsPlaying(true);
      }
      return;
    }

    // Generate new audio
    if (useFallback) {
      // Web Speech API fallback
      playWithWebSpeech();
    } else {
      // Piper TTS
      try {
        setPiperLoading(true);
        const wav = await generatePiperAudio();
        setPiperLoading(false);

        if (wav) {
          const url = URL.createObjectURL(wav);

          if (audioRef.current) {
            audioRef.current.pause();
            URL.revokeObjectURL(audioRef.current.src);
          }

          const audio = new Audio(url);
          audio.playbackRate = speed;
          audioRef.current = audio;

          audio.onplay = () => {
            setIsPlaying(true);
            setIsPaused(false);
          };

          audio.onpause = () => {
            if (!audio.ended) {
              setIsPaused(true);
              setIsPlaying(false);
            }
          };

          audio.onended = () => {
            setIsPlaying(false);
            setIsPaused(false);
            setProgress(100);
          };

          audio.ontimeupdate = () => {
            if (audio.duration) {
              setProgress((audio.currentTime / audio.duration) * 100);
            }
          };

          audio.onerror = () => {
            setError('Audio playback failed');
            setIsPlaying(false);
          };

          await audio.play();
        }
      } catch {
        setPiperLoading(false);
        setError('Failed to generate audio. Switching to fallback...');
        setUseFallback(true);
        playWithWebSpeech();
      }
    }
  };

  const playWithWebSpeech = () => {
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    const voice = webSpeechVoices.find(v => v.name === selectedWebVoice);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.rate = speed;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
      startProgressTracking();
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setProgress(100);
      stopProgressTracking();
    };

    utterance.onerror = (e) => {
      setIsPlaying(false);
      setIsPaused(false);
      stopProgressTracking();
      if (e.error !== 'canceled') {
        setError('Speech synthesis failed');
      }
    };

    speechSynthesis.speak(utterance);
  };

  const startProgressTracking = () => {
    stopProgressTracking();
    const wordsPerMinute = 150 * speed;
    const words = text.split(/\s+/).length;
    const estimatedDuration = (words / wordsPerMinute) * 60 * 1000;
    const startTime = Date.now();

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(99, (elapsed / estimatedDuration) * 100);
      setProgress(newProgress);
    }, 100);
  };

  const stopProgressTracking = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const handlePause = () => {
    if (useFallback) {
      speechSynthesis.pause();
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPaused(true);
    setIsPlaying(false);
    stopProgressTracking();
  };

  const handleStop = () => {
    if (useFallback) {
      speechSynthesis.cancel();
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    stopProgressTracking();
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (audioRef.current && !useFallback) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const handleDownload = async () => {
    if (!text.trim()) {
      setError('Please enter text to generate audio');
      return;
    }

    if (useFallback) {
      setError('Download not available with browser voices. Switch to Neural TTS.');
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const wav = await generatePiperAudio();
      if (wav) {
        const url = URL.createObjectURL(wav);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'study-podcast.wav';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      setError('Failed to generate audio file');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    handleStop();
    setText('');
    setProgress(0);
    setError('');
  };

  const estimatedDuration = () => {
    const words = text.split(/\s+/).filter(Boolean).length;
    const minutes = Math.ceil(words / (150 * speed));
    return minutes < 1 ? '< 1 min' : `~${minutes} min`;
  };

  const getFileIcon = (name: string, type: string) => {
    if (type !== 'upload') {
      const icons: Record<string, string> = {
        assignment: '📝', summarize: '📄', mcq: '✅',
        quiz: '🧠', pop: '⚡', notes: '📝', math: '🧮',
      };
      return icons[type] || '📄';
    }
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📕';
    if (['doc', 'docx'].includes(ext || '')) return '📘';
    if (['ppt', 'pptx'].includes(ext || '')) return '📙';
    return '📄';
  };

  const isVoiceDownloaded = (voiceId: string) => storedVoices.includes(voiceId);

  return (
    <div className="audio-podcast">
      {/* Header */}
      <div className="header">
        <div>
          <h3>AI Podcast Generator</h3>
          <p>Turn your study notes into natural-sounding audio</p>
        </div>
        {(text || isPlaying) && (
          <button className="btn ghost" onClick={handleReset}>
            Reset
          </button>
        )}
      </div>

      {/* Engine Toggle */}
      <div className="engine-toggle">
        <button
          className={`engine-btn ${!useFallback ? 'active' : ''}`}
          onClick={() => setUseFallback(false)}
          disabled={!piperLoaded}
        >
          🧠 Neural TTS
          {!piperLoaded && <span className="loading-dot">...</span>}
        </button>
        <button
          className={`engine-btn ${useFallback ? 'active' : ''}`}
          onClick={() => setUseFallback(true)}
        >
          🔊 Browser TTS
        </button>
      </div>

      {/* Info Badge */}
      <div className={`info-badge ${useFallback ? 'fallback' : 'neural'}`}>
        {useFallback
          ? 'Using browser voices - quality varies by device'
          : 'Neural TTS - High quality offline voices (larger download, cached after first use)'
        }
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">{error}</div>
      )}

      {/* Download Progress */}
      {downloadingVoice && (
        <div className="download-progress">
          <div className="download-info">
            <span>Downloading voice model...</span>
            <span>{downloadProgress}%</span>
          </div>
          <div className="download-bar">
            <div className="download-fill" style={{ width: `${downloadProgress}%` }} />
          </div>
        </div>
      )}

      {/* File Selector Section */}
      <div className="file-selector-section">
        <button
          className="btn secondary file-toggle"
          onClick={() => setShowFileSelector(!showFileSelector)}
          disabled={isPlaying}
        >
          📁 {showFileSelector ? 'Hide File Selector' : 'Select from StudyPilot'}
        </button>

        {showFileSelector && (
          <div className="file-picker">
            <div className="picker-row">
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="picker-select"
              >
                <option value="">-- Select Folder --</option>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>

              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="picker-select"
                disabled={!selectedFolder}
              >
                <option value="">-- Select Subfolder --</option>
                {topics.map(topic => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
              </select>
            </div>

            {loadingFiles && (
              <div className="loading-files">Loading files...</div>
            )}

            {selectedTopic && !loadingFiles && files.length === 0 && (
              <div className="no-files">No files in this subfolder</div>
            )}

            {files.length > 0 && (
              <div className="file-list">
                {files.map(file => (
                  <button
                    key={file.id}
                    className="file-item"
                    onClick={() => handleSelectFile(file)}
                    disabled={extractingFile}
                  >
                    <span className="file-icon">{getFileIcon(file.name, file.type)}</span>
                    <span className="file-name">{file.name}</span>
                    {extractingFile && <span className="extracting">Extracting...</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Text Input */}
      <div className="input-section">
        <label>Paste your study notes or summary:</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your study material here, or select a file from StudyPilot above..."
          rows={8}
          disabled={isPlaying}
        />
        {text && (
          <div className="text-stats">
            <span>{text.split(/\s+/).filter(Boolean).length} words</span>
            <span>Estimated duration: {estimatedDuration()}</span>
          </div>
        )}
      </div>

      {/* Voice Selection */}
      <div className="voice-section">
        <label>Select Voice:</label>

        {!useFallback ? (
          // Piper Neural Voices
          <div className="voice-grid">
            {PIPER_VOICES.map((voice) => (
              <button
                key={voice.id}
                className={`voice-option ${selectedVoice === voice.id ? 'selected' : ''}`}
                onClick={() => setSelectedVoice(voice.id)}
                disabled={isPlaying || downloadingVoice === voice.id}
              >
                <div className="voice-header">
                  <span className="voice-name">{voice.name}</span>
                  {isVoiceDownloaded(voice.id) ? (
                    <span className="downloaded-badge">✓</span>
                  ) : (
                    <span className="download-badge">↓</span>
                  )}
                </div>
                <span className="voice-desc">{voice.description}</span>
                <span className="voice-lang">{voice.language}</span>
                <span className={`voice-quality ${voice.quality}`}>{voice.quality.toUpperCase()}</span>
              </button>
            ))}
          </div>
        ) : (
          // Web Speech Voices
          <select
            value={selectedWebVoice}
            onChange={(e) => setSelectedWebVoice(e.target.value)}
            className="voice-select"
            disabled={isPlaying}
          >
            {webSpeechVoices.map((voice, i) => (
              <option key={i} value={voice.name}>
                {voice.name} ({voice.lang}) {WEB_SPEECH_PREMIUM.some(p => voice.name.includes(p)) ? '★' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Speed Control */}
      <div className="control-section">
        <div className="control-item">
          <label>Speed: {speed}x</label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speed}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            disabled={isPlaying && useFallback}
          />
          <div className="range-labels">
            <span>0.5x</span>
            <span>2x</span>
          </div>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="playback-section">
        {/* Progress Bar */}
        {(isPlaying || isPaused || progress > 0) && (
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="playback-controls">
          {!isPlaying ? (
            <button
              className="btn play-btn"
              onClick={handlePlay}
              disabled={!text.trim() || isGenerating || piperLoading || !!downloadingVoice}
            >
              {piperLoading ? 'Generating...' : isPaused ? '▶ Resume' : '▶ Play'}
            </button>
          ) : (
            <button className="btn pause-btn" onClick={handlePause}>
              ⏸ Pause
            </button>
          )}
          <button
            className="btn secondary stop-btn"
            onClick={handleStop}
            disabled={!isPlaying && !isPaused}
          >
            ⏹ Stop
          </button>
          <button
            className="btn secondary download-btn"
            onClick={handleDownload}
            disabled={!text.trim() || isGenerating || isPlaying || useFallback}
          >
            {isGenerating ? 'Generating...' : '⬇ Download'}
          </button>
        </div>
      </div>

      {/* Tips */}
      <div className="tips-section">
        <h4>Tips for best results:</h4>
        <ul>
          <li>Neural TTS produces much more natural speech than browser voices</li>
          <li>Voice models are cached - only download once per voice</li>
          <li>Shorter summaries (under 500 words) generate faster</li>
          <li>Download audio to listen offline on any device</li>
          <li>Adjust speed without re-generating (Neural TTS only)</li>
        </ul>
      </div>

      <style jsx>{`
        .audio-podcast {
          padding: var(--space-4);
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-3);
        }

        .header h3 {
          margin: 0 0 var(--space-1) 0;
          font-size: var(--font-lg);
        }

        .header p {
          margin: 0;
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .engine-toggle {
          display: flex;
          gap: var(--space-1);
          margin-bottom: var(--space-3);
          background: var(--bg-inset);
          padding: var(--space-1);
          border-radius: var(--radius-md);
        }

        .engine-btn {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          font-size: var(--font-meta);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
        }

        .engine-btn:hover:not(:disabled) {
          background: var(--bg-surface);
        }

        .engine-btn.active {
          background: var(--bg-surface);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .engine-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .loading-dot {
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        .info-badge {
          display: inline-block;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          font-size: var(--font-tiny);
          margin-bottom: var(--space-4);
        }

        .info-badge.neural {
          background: var(--primary-muted);
          color: var(--primary);
        }

        .info-badge.fallback {
          background: var(--warning-muted);
          color: var(--warning);
        }

        .error-message {
          padding: var(--space-3);
          background: var(--error-muted);
          color: var(--error);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          font-size: var(--font-meta);
        }

        .download-progress {
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
        }

        .download-info {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-meta);
          margin-bottom: var(--space-2);
        }

        .download-bar {
          height: 6px;
          background: var(--bg-surface);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .download-fill {
          height: 100%;
          background: var(--primary);
          transition: width 0.2s ease;
        }

        /* File Selector Section */
        .file-selector-section {
          margin-bottom: var(--space-4);
        }

        .file-toggle {
          width: 100%;
          justify-content: center;
        }

        .file-picker {
          margin-top: var(--space-3);
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .picker-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
        }

        @media (max-width: 500px) {
          .picker-row {
            grid-template-columns: 1fr;
          }
        }

        .picker-select {
          width: 100%;
          padding: var(--space-2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
          background: var(--bg-surface);
        }

        .picker-select:disabled {
          opacity: 0.5;
        }

        .loading-files, .no-files {
          text-align: center;
          padding: var(--space-3);
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .file-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          max-height: 200px;
          overflow-y: auto;
        }

        .file-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
        }

        .file-item:hover:not(:disabled) {
          border-color: var(--primary);
          background: var(--primary-muted);
        }

        .file-item:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .file-item .file-icon {
          font-size: 18px;
          flex-shrink: 0;
        }

        .file-item .file-name {
          flex: 1;
          font-size: var(--font-meta);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .file-item .extracting {
          font-size: var(--font-tiny);
          color: var(--primary);
        }

        .input-section {
          margin-bottom: var(--space-4);
        }

        .input-section label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .input-section textarea {
          width: 100%;
          padding: var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: var(--font-body);
          font-family: inherit;
          resize: vertical;
          background: var(--bg-base);
        }

        .input-section textarea:focus {
          outline: none;
          border-color: var(--primary);
        }

        .input-section textarea:disabled {
          opacity: 0.6;
        }

        .text-stats {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-tiny);
          color: var(--text-muted);
          margin-top: var(--space-2);
        }

        .voice-section {
          margin-bottom: var(--space-4);
        }

        .voice-section label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .voice-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: var(--space-2);
        }

        .voice-option {
          padding: var(--space-2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .voice-option:hover:not(:disabled) {
          border-color: var(--primary);
        }

        .voice-option.selected {
          border-color: var(--primary);
          background: var(--primary-muted);
        }

        .voice-option:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .voice-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .voice-name {
          font-weight: 500;
          font-size: var(--font-meta);
        }

        .downloaded-badge {
          color: var(--success);
          font-size: var(--font-tiny);
        }

        .download-badge {
          color: var(--text-muted);
          font-size: var(--font-tiny);
        }

        .voice-desc {
          font-size: var(--font-tiny);
          color: var(--text-secondary);
        }

        .voice-lang {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .voice-quality {
          margin-top: var(--space-1);
          font-size: var(--font-tiny);
          font-weight: 600;
          padding: 2px 6px;
          border-radius: var(--radius-full);
          width: fit-content;
        }

        .voice-quality.high {
          background: rgba(16, 185, 129, 0.15);
          color: #059669;
        }

        .voice-quality.medium {
          background: rgba(59, 130, 246, 0.15);
          color: #2563eb;
        }

        .voice-quality.low {
          background: rgba(245, 158, 11, 0.15);
          color: #b45309;
        }

        .voice-select {
          width: 100%;
          padding: var(--space-2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
          background: var(--bg-surface);
        }

        .control-section {
          margin-bottom: var(--space-4);
        }

        .control-item label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 500;
          margin-bottom: var(--space-2);
        }

        .control-item input[type="range"] {
          width: 100%;
        }

        .range-labels {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .playback-section {
          margin-bottom: var(--space-4);
        }

        .progress-container {
          height: 6px;
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          margin-bottom: var(--space-3);
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          background: var(--primary);
          border-radius: var(--radius-full);
          transition: width 0.1s linear;
        }

        .playback-controls {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .play-btn, .pause-btn {
          min-width: 120px;
        }

        .tips-section {
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .tips-section h4 {
          margin: 0 0 var(--space-2) 0;
          font-size: var(--font-meta);
          font-weight: 600;
        }

        .tips-section ul {
          margin: 0;
          padding-left: var(--space-4);
        }

        .tips-section li {
          font-size: var(--font-tiny);
          color: var(--text-secondary);
          margin-bottom: var(--space-1);
        }
      `}</style>
    </div>
  );
}
