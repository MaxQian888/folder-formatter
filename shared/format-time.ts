export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatHms(timestamp: number | Date): string {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatYmdHms(timestamp: number | Date): string {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${formatHms(d)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000)
    return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60)
    return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.floor(seconds - minutes * 60);
  return `${minutes}m ${rem}s`;
}
