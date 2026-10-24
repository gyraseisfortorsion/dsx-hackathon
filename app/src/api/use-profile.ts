import { useCurrentUser } from '@/stores/session-store';
import { useStudent } from './queries';
import { firstName, initialsOf, profileSubtitle } from './selectors';

/** Display fields for the signed-in student, with username-based fallbacks while the profile loads. */
export function useProfileDisplay() {
  const user = useCurrentUser() ?? '';
  const { data: profile } = useStudent();
  const fallbackName = user.charAt(0).toUpperCase() + user.slice(1);
  const name = profile?.full_name ?? fallbackName;
  return {
    profile,
    name,
    firstName: profile ? firstName(profile) : fallbackName,
    initials: initialsOf(name),
    subtitle: profile ? profileSubtitle(profile) : '',
  };
}
