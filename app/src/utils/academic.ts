export const courseLabel = (id: string) => id.replace(/-/g, ' ').toUpperCase();
export const splitCodes = (value: string) => [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];
export const isNumberIn = (value: string, min: number, max: number, integer = false) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max && (!integer || Number.isInteger(Number(value)));
export const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const humanLabel = (value: string) => value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
