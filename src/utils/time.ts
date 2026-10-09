export function toISO(millis: number): string {
  return new Date(millis).toISOString()
}

export function parseISO(value: string): number {
  return Date.parse(value)
}
