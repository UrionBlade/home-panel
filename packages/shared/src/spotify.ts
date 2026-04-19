export interface SpotifyAuthStatus {
  configured: boolean;
  displayName: string | null;
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string; // "Speaker", "Smartphone", "Computer", "TV", "CastVideo" etc
  isActive: boolean;
  volumePercent: number | null;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  album: string;
  albumArt: string | null; // URL immagine copertina
  durationMs: number;
}

export interface SpotifyPlaybackState {
  isPlaying: boolean;
  track: SpotifyTrack | null;
  progressMs: number;
  device: SpotifyDevice | null;
  shuffleState: boolean;
  repeatState: "off" | "context" | "track";
}

export interface SpotifySearchResults {
  tracks: SpotifyTrack[];
  playlists: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    trackCount: number;
    owner: string;
  }>;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  owner: string;
}
