import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, CurrentUser, Member, VoiceRoom } from '../types';

interface Props {
  channel: Channel;
  currentUser: CurrentUser | null;
  voiceRoom: VoiceRoom;
  members: Member[];
  socket: any;
  onJoinVoice: (channelId: string) => Promise<void>;
  onLeaveVoice: (channelId: string) => Promise<void>;
  onVoiceChunk: (channelId: string, chunk: Blob, mimeType: string, speaking: boolean, volume?: number) => void;
}

function VoicePanelComponent({ channel, currentUser, voiceRoom, members, socket, onJoinVoice, onLeaveVoice, onVoiceChunk }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!socket) return;
    const handleVoiceChunk = ({ userId, volume }: { userId: string; volume?: number }) => {
      setVolumes((curr) => ({
        ...curr,
        [userId]: volume || 0,
      }));
    };
    const handleVoiceStop = ({ userId }: { userId: string }) => {
      setVolumes((curr) => ({
        ...curr,
        [userId]: 0,
      }));
    };
    socket.on('voice:chunk', handleVoiceChunk);
    socket.on('voice:stop', handleVoiceStop);
    return () => {
      socket.off('voice:chunk', handleVoiceChunk);
      socket.off('voice:stop', handleVoiceStop);
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current?.stop();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const participants = useMemo(
    () =>
      voiceRoom.participants.map((participantId) => {
        const member = members.find((item) => item.id === participantId);
        return member ? { id: member.id, name: member.name, role: member.role, status: member.status } : { id: participantId, name: participantId, role: 'Guest', status: 'offline' as const };
      }),
    [members, voiceRoom.participants],
  );

  async function startRecording() {
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      await onJoinVoice(channel.id);
      
      let audioCtx: AudioContext | null = null;
      const levelRef = { current: 0 };
      
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          const nextLevel = Math.min(Math.round(average / 15), 10);
          setLevel(nextLevel);
          levelRef.current = nextLevel;
          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };
        animationFrameRef.current = requestAnimationFrame(checkVolume);
      } catch (err) {
        console.warn('Could not initialize audio visualizer analyser:', err);
      }

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        onVoiceChunk(channel.id, event.data, event.data.type || 'audio/webm', true, levelRef.current);
      };
      recorder.onstop = () => {
        onLeaveVoice(channel.id);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        analyserRef.current = null;
        setLevel(0);
      };
      recorder.start(260);
      setRecording(true);
      socket?.emit('join:channel', { channelId: channel.id, userId: currentUser?.id ?? 'me' });
    } catch (error) {
      setMicError(error instanceof Error ? error.message : 'Mikrofon konnte nicht gestartet werden.');
    }
  }

  function stopRecording() {
    setRecording(false);
    recorderRef.current?.stop();
    socket?.emit('voice:stop', { channelId: channel.id, userId: currentUser?.id ?? 'me' });
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
    setLevel(0);
  }

  return (
    <div className="voice-stage">
      <div className="voice-card">
        <div className="tiny-pill">Voice-Raum</div>
        <h3 className="panel-title" style={{ marginTop: '10px' }}>{channel.name}</h3>
        <p className="helper" style={{ marginBottom: 0 }}>{channel.topic}</p>
      </div>

      <div className="orb" aria-hidden="true" style={{ opacity: recording ? 1 : 0.72, transform: `scale(${1 + level * 0.05})`, filter: recording ? `drop-shadow(0 0 ${12 + level * 4}px var(--accent-2))` : 'none', transition: 'transform 100ms ease' }} />

      <div className="stack">
        <div className="stat-grid">
          <div className="stat-card">
            <small>Teilnehmer</small>
            <strong>{voiceRoom.participants.length}</strong>
          </div>
          <div className="stat-card">
            <small>Aktiver Sprecher</small>
            <strong>{voiceRoom.activeSpeakerId ? participants.find((item) => item.id === voiceRoom.activeSpeakerId)?.name ?? 'Jemand' : 'Niemand'}</strong>
          </div>
        </div>

        <button className={recording ? 'action secondary' : 'action'} onClick={recording ? stopRecording : startRecording}>
          {recording ? 'Voice stoppen' : 'Push to talk'}
        </button>

        {micError && <div className="preview-card" style={{ borderColor: 'rgba(255, 110, 143, 0.4)' }}>{micError}</div>}

        <div className="section-label">Im Raum</div>
        {participants.map((participant) => {
          const isSpeaking = participant.id === voiceRoom.activeSpeakerId;
          const userVolume = participant.id === currentUser?.id ? level : (volumes[participant.id] || 0);

          return (
            <div
              key={participant.id}
              className={`voice-listener ${isSpeaking ? 'active' : ''}`}
              style={{
                boxShadow: isSpeaking ? `0 0 ${8 + userVolume * 2}px rgba(77, 214, 255, ${0.15 + userVolume * 0.05})` : 'none',
                transform: isSpeaking ? `scale(${1 + userVolume * 0.01})` : 'none',
                transition: 'transform 100ms ease, box-shadow 100ms ease'
              }}
            >
              <div>
                <strong>{participant.name}</strong>
                <div className="role">{participant.role}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isSpeaking && <span style={{ color: 'var(--accent-2)', fontSize: '0.8rem' }}>🔊</span>}
                <span className={`presence ${participant.status}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const VoicePanel = memo(VoicePanelComponent);
