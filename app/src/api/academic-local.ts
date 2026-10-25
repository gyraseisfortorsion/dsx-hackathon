import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/stores/session-store';
import { kvStorage } from '@/utils/kv-storage';
import type { AcademicTask } from './academic';

/** The API has write-only availability/completed-course collections. Keep this device's last submitted copy, scoped to its student. */
export function useAcademicLocal<T>(name: string, initial: T) {
  const user = useCurrentUser();
  const client = useQueryClient();
  const key = [user, 'academic-local', name];
  const storageKey = `academic.${user}.${name}`;
  const query = useQuery({ queryKey: key, enabled: !!user, queryFn: async () => {
    const raw = await kvStorage.get(storageKey);
    return raw ? JSON.parse(raw) as T : initial;
  } });
  return { ...query, save: async (value: T) => {
    await kvStorage.set(storageKey, JSON.stringify(value));
    client.setQueryData(key, value);
  } };
}
export const useRememberedTasks = () => useAcademicLocal<AcademicTask[]>('tasks', []);
