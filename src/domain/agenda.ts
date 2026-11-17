export type DeviceAuthorization =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'unavailable';
export interface NotificationStatus {
  installed: boolean;
  authorization: DeviceAuthorization;
  enabled: boolean;
  scheduled: number;
  deferred: number;
  errorCode: string | null;
}
export interface DeviceCalendarStatus {
  installed: boolean;
  authorization: DeviceAuthorization;
  linked: number;
  failed: number;
  errorCode: string | null;
}
export interface AgendaStatus {
  notifications: NotificationStatus;
  calendar: DeviceCalendarStatus;
}
export interface CalendarTarget {
  id: string;
  title: string;
}
export interface CalendarLink {
  eventId: string;
  targetId: string;
  targetTitle: string;
  externalId: string | null;
  errorCode: string | null;
}
