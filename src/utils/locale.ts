/** Shared Indian locale formatting for localized prototype values. */
export const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const indianNumberFormatter = new Intl.NumberFormat('en-IN');
export const formatINR = (value: number) => inrFormatter.format(value);
export const formatIndianNumber = (value: number) => indianNumberFormatter.format(value);
export const formatIndianDateTime = (date: Date) => `${date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} ${date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST`;
