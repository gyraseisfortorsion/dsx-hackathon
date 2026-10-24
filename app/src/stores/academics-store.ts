import { create } from 'zustand';

type AcademicsState = {
  gradesVisible: boolean;
  reportingAbsence: boolean;
  absenceReportedFor: string | null;
  setGradesVisible: (value: boolean) => void;
  setReportingAbsence: (value: boolean) => void;
  reportAbsence: (course: string) => void;
};

export const useAcademicsStore = create<AcademicsState>((set) => ({
  gradesVisible: false,
  reportingAbsence: false,
  absenceReportedFor: null,
  setGradesVisible: (gradesVisible) => set({ gradesVisible }),
  setReportingAbsence: (reportingAbsence) => set({ reportingAbsence }),
  reportAbsence: (course) => set({ absenceReportedFor: course, reportingAbsence: false }),
}));
