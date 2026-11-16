export type IdentityProvider = 'apple' | 'google' | 'azure';
export interface IdentitySnapshot {
  installed: boolean;
  providers: Array<{ provider: IdentityProvider; enabled: boolean }>;
  account: {
    id: string;
    email: string | null;
    name: string | null;
    providers: IdentityProvider[];
  } | null;
  cloudSyncAvailable: boolean;
}
