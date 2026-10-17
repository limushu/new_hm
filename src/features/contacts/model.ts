import type { Contact } from '../../domain/types';
export const emptyContact = (kind: Contact['kind'] = 'person', name = ''): Contact => ({
  id: crypto.randomUUID(),
  name,
  kind,
  phone: '',
  address: '',
  notes: '',
});
