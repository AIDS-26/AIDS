export type Speed = 60 | 120 | 360;
export type Playback = { t: number; speed: Speed; playing: boolean; updatedAt: number };
export type PlaybackAction = { now: number } & (
  { type: "play" | "pause" | "tick" | "restart" | "finish" } | { type: "speed"; speed: Speed }
);
export const initialPlayback: Playback = { t: 0, speed: 120, playing: false, updatedAt: 0 };

// Monotonic elapsed time prevents interval delays and background tabs from losing events.
export function playbackReducer(state: Playback, action: PlaybackAction, duration: number): Playback {
  if (action.type === "restart") return { ...initialPlayback, speed: state.speed, updatedAt: action.now };
  if (action.type === "finish") return { ...state, t: duration, playing: false, updatedAt: action.now };
  const t = state.playing
    ? Math.min(duration, state.t + Math.max(0, action.now - state.updatedAt) / 1000 * state.speed)
    : state.t;
  const playing = action.type === "play" ? true : action.type === "pause" ? false : state.playing;
  return { t, playing: playing && t < duration, speed: action.type === "speed" ? action.speed : state.speed, updatedAt: action.now };
}

export function selectFrame<T extends { t: number }>(frames: readonly T[], t: number): T {
  // Frames are sorted and start at zero. Inclusion at t is intentional.
  return frames.findLast(frame => frame.t <= t) ?? frames[0];
}
