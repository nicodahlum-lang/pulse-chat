import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, CurrentUser, Member, VoiceRoom } from '../types';

interface Props {
  channel: Channel;
  currentUser: CurrentUser | null;
  voiceRoom: VoiceRoom;
  members: Member[];
  socket: any;
  onJoinVoice: (channelId: string) => Promise<VoiceRoom>;
  onLeaveVoice: (channelId: string) => Promise<void>;
  onVoiceChunk: (channelId: string, chunk: Blob, mimeType: string, speaking: boolean, volume?: number) => void;
}

type VoiceSignal =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

function VoicePanelComponent({ channel, currentUser, voiceRoom, members, socket, onJoinVoice, onLeaveVoice, onVoiceChunk }: Props) {
  const supportsWebRTC = typeof window !== 'undefined' && 'RTCPeerConnection' in window && !!navigator.mediaDevices?.getUserMedia;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const remoteAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const joinedVoiceRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [voiceMode, setVoiceMode] = useState<'webrtc' | 'legacy' | null>(null);
  const [remotePeerIds, setRemotePeerIds] = useState<string[]>([]);

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

    const handleSignal = async ({
      channelId: incomingChannelId,
      fromUserId,
      signal,
    }: {
      channelId: string;
      fromUserId: string;
      signal: VoiceSignal;
    }) => {
      if (incomingChannelId !== channel.id) return;
      if (!currentUser || fromUserId === currentUser.id) return;
      if (voiceMode !== 'webrtc') return;

      const existing = peerConnectionsRef.current.get(fromUserId);
      const pc = existing ?? createPeerConnection(fromUserId);

      if (!existing) {
        peerConnectionsRef.current.set(fromUserId, pc);
      }

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:signal', {
            channelId: channel.id,
            toUserId: fromUserId,
            fromUserId: currentUser.id,
            signal: { type: 'answer', sdp: answer },
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'ice-candidate' && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (error) {
        console.warn('Voice signaling failed:', error);
      }
    };

    socket.on('voice:chunk', handleVoiceChunk);
    socket.on('voice:stop', handleVoiceStop);
    socket.on('voice:signal', handleSignal);

    return () => {
      socket.off('voice:chunk', handleVoiceChunk);
      socket.off('voice:stop', handleVoiceStop);
      socket.off('voice:signal', handleSignal);
    };
  }, [channel.id, currentUser, socket, voiceMode]);

  useEffect(() => {
    return () => {
      if (joinedVoiceRef.current) {
        void onLeaveVoice(channel.id).catch((error) => {
          console.warn('Failed to leave voice room during cleanup:', error);
        });
        joinedVoiceRef.current = false;
      }
      stopAllAudio();
    };
  }, [channel.id, onLeaveVoice]);

  useEffect(() => {
    remotePeerIds.forEach((peerId) => {
      const audioElement = remoteAudioRefs.current[peerId];
      const stream = remoteStreamsRef.current.get(peerId);
      if (audioElement && stream && audioElement.srcObject !== stream) {
        audioElement.srcObject = stream;
      }
    });
  }, [remotePeerIds]);

  const participants = useMemo(
    () =>
      voiceRoom.participants.map((participantId) => {
        const member = members.find((item) => item.id === participantId);
        return member
          ? { id: member.id, name: member.name, role: member.role, status: member.status }
          : { id: participantId, name: participantId, role: 'Guest', status: 'offline' as const };
      }),
    [members, voiceRoom.participants],
  );

  function setupAnalyzer(stream: MediaStream) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
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
        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      animationFrameRef.current = requestAnimationFrame(checkVolume);
    } catch (error) {
      console.warn('Could not initialize audio visualizer analyser:', error);
    }
  }

  function cleanupVisualizer() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
    setLevel(0);
  }

  function stopAllAudio() {
    cleanupVisualizer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionsRef.current.forEach((connection) => connection.close());
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    remoteAudioRefs.current = {};
    setRemotePeerIds([]);
    setRecording(false);
    setVoiceMode(null);
  }

  const createPeerConnection = useCallback((peerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) {
        pc.addTrack(track, localStreamRef.current);
      }
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate || !socket || !currentUser) return;
      socket.emit('voice:signal', {
        channelId: channel.id,
        toUserId: peerId,
        fromUserId: currentUser.id,
        signal: {
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        },
      });
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      remoteStreamsRef.current.set(peerId, stream);
      setRemotePeerIds((current) => (current.includes(peerId) ? current : [...current, peerId]));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        peerConnectionsRef.current.delete(peerId);
        remoteStreamsRef.current.delete(peerId);
        setRemotePeerIds((current) => current.filter((id) => id !== peerId));
      }
    };

    return pc;
  }, [channel.id, currentUser, socket]);

  const connectToPeers = useCallback(async (peerIds: string[]) => {
    if (!socket || !currentUser) return;

    for (const peerId of peerIds) {
      if (!peerId || peerId === currentUser.id || peerConnectionsRef.current.has(peerId)) continue;

      const pc = createPeerConnection(peerId);
      peerConnectionsRef.current.set(peerId, pc);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('voice:signal', {
          channelId: channel.id,
          toUserId: peerId,
          fromUserId: currentUser.id,
          signal: {
            type: 'offer',
            sdp: offer,
          },
        });
      } catch (error) {
        console.warn('Could not create WebRTC offer:', error);
      }
    }
  }, [channel.id, createPeerConnection, currentUser, socket]);

  useEffect(() => {
    const activePeerIds = new Set(
      voiceRoom.participants.filter((participantId) => participantId !== currentUser?.id),
    );
    const missingPeerIds = Array.from(activePeerIds).filter(
      (peerId) => !peerConnectionsRef.current.has(peerId),
    );

    if (voiceMode === 'webrtc' && recording && missingPeerIds.length > 0) {
      void connectToPeers(missingPeerIds);
    }

    for (const [peerId, connection] of peerConnectionsRef.current.entries()) {
      if (activePeerIds.has(peerId)) continue;
      connection.close();
      peerConnectionsRef.current.delete(peerId);
      remoteStreamsRef.current.delete(peerId);
      setRemotePeerIds((current) => current.filter((id) => id !== peerId));
    }

    setRemotePeerIds((current) => current.filter((peerId) => activePeerIds.has(peerId)));
  }, [connectToPeers, currentUser?.id, recording, voiceMode, voiceRoom.participants]);

  async function startLegacyPushToTalk() {
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      await onJoinVoice(channel.id);
      joinedVoiceRef.current = true;
      socket?.emit('join:channel', { channelId: channel.id, userId: currentUser?.id ?? 'me' });

      const levelRef = { current: 0 };
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
          const average = sum / bufferLength;
          const nextLevel = Math.min(Math.round(average / 15), 10);
          setLevel(nextLevel);
          levelRef.current = nextLevel;
          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };
        animationFrameRef.current = requestAnimationFrame(checkVolume);
      } catch (error) {
        console.warn('Could not initialize audio visualizer analyser:', error);
      }

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        onVoiceChunk(channel.id, event.data, event.data.type || 'audio/webm', true, levelRef.current);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        recorderRef.current = null;
        cleanupVisualizer();
        setRecording(false);
      };
      recorder.start(260);
      setVoiceMode('legacy');
      setRecording(true);
    } catch (error) {
      stopAllAudio();
      setMicError(error instanceof Error ? error.message : 'Mikrofon konnte nicht gestartet werden.');
    }
  }

  async function startWebRTCVoice() {
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const joinedRoom = await onJoinVoice(channel.id);
      joinedVoiceRef.current = true;
      socket?.emit('join:channel', { channelId: channel.id, userId: currentUser?.id ?? 'me' });
      setupAnalyzer(stream);
      setVoiceMode('webrtc');
      setRecording(true);
      await connectToPeers(joinedRoom.participants.filter((participantId) => participantId !== currentUser?.id));
    } catch (error) {
      stopAllAudio();
      setMicError(error instanceof Error ? error.message : 'Mikrofon konnte nicht gestartet werden.');
    }
  }

  async function startVoice() {
    if (supportsWebRTC) {
      await startWebRTCVoice();
      return;
    }
    await startLegacyPushToTalk();
  }

  async function stopVoice() {
    try {
      await onLeaveVoice(channel.id);
      joinedVoiceRef.current = false;
      socket?.emit('voice:stop', { channelId: channel.id, userId: currentUser?.id ?? 'me' });
    } finally {
      stopAllAudio();
    }
  }

  const modeLabel = voiceMode === 'webrtc' ? 'WebRTC' : voiceMode === 'legacy' ? 'Fallback' : supportsWebRTC ? 'WebRTC bereit' : 'Legacy';

  return (
    <div className="voice-stage">
      <div className="voice-card">
        <div className="tiny-pill">Voice-Raum · {modeLabel}</div>
        <h3 className="panel-title" style={{ marginTop: '10px' }}>{channel.name}</h3>
        <p className="helper" style={{ marginBottom: 0 }}>{channel.topic}</p>
      </div>

      <div
        className="orb"
        aria-hidden="true"
        style={{
          opacity: recording ? 1 : 0.72,
          transform: `scale(${1 + level * 0.05})`,
          filter: recording ? `drop-shadow(0 0 ${12 + level * 4}px var(--accent-2))` : 'none',
          transition: 'transform 100ms ease',
        }}
      />

      <div className="stack">
        <div className="stat-grid">
          <div className="stat-card">
            <small>Teilnehmer</small>
            <strong>{voiceRoom.participants.length}</strong>
          </div>
          <div className="stat-card">
            <small>Aktiver Sprecher</small>
            <strong>
              {voiceRoom.activeSpeakerId
                ? participants.find((item) => item.id === voiceRoom.activeSpeakerId)?.name ?? 'Jemand'
                : 'Niemand'}
            </strong>
          </div>
        </div>

        <button className={recording ? 'action secondary' : 'action'} onClick={recording ? stopVoice : startVoice}>
          {recording ? 'Voice stoppen' : supportsWebRTC ? 'Voice beitreten' : 'Push to talk'}
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
                transition: 'transform 100ms ease, box-shadow 100ms ease',
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

        {voiceMode === 'webrtc' && remotePeerIds.length > 0 && (
          <div className="preview-card">
            <div className="section-label" style={{ marginTop: 0 }}>Verbundene Peers</div>
            <div className="helper">Direktes Audio zwischen den Browsern ist aktiv. Fallback-Chunks werden nicht mehr benötigt.</div>
            <div style={{ display: 'none' }}>
              {remotePeerIds.map((peerId) => (
                <audio
                  key={peerId}
                  autoPlay
                  playsInline
                  ref={(element) => {
                    remoteAudioRefs.current[peerId] = element;
                    const stream = remoteStreamsRef.current.get(peerId);
                    if (element && stream) {
                      element.srcObject = stream;
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const VoicePanel = memo(VoicePanelComponent);
