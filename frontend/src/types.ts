export type ChannelType = 'text' | 'voice' | 'dm';
export type Presence = 'online' | 'idle' | 'offline' | 'dnd';

export interface Avatar {
  type: 'gradient';
  from: string;
  to: string;
  label: string;
}

export interface Attachment {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}


export interface Workspace {
  id: string;
  name: string;
  tagline: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  handle: string;
  role: string;
  status: Presence;
  avatar: Avatar;
  activity?: string;
}

export interface Server {
  id: string;
  name: string;
  icon: string;
  accent: string;
  description: string;
}

export interface Channel {
  id: string;
  serverId: string | null;
  name: string;
  type: ChannelType;
  topic: string;
  memberIds?: string[];
}

export interface Member {
  id: string;
  name: string;
  handle: string;
  role: string;
  status: Presence;
  serverId: string;
  activity: string;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  kind: 'text' | 'system';
  content: string;
  createdAt: string;
  parentId?: string | null;
  reactions?: { emoji: string; userIds: string[] }[];
  attachment?: Attachment | null;
  sendingStatus?: 'sending' | 'sent' | 'failed';
}

export interface VoiceRoom {
  participants: string[];
  activeSpeakerId: string | null;
  lastSpeakingAt: string | null;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  detail: string;
  time: string;
}

export interface BootstrapPayload {
  workspace: Workspace;
  currentUser: CurrentUser;
  auth?: {
    authenticated: boolean;
    userId: string | null;
  };
  servers: Server[];
  channels: Channel[];
  members: Member[];
  messages: Message[];
  voiceRooms: Record<string, VoiceRoom>;
  activity: ActivityItem[];
  settings: {
    density: 'compact' | 'spacious';
    theme: 'midnight';
  };
}
