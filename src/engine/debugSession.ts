// A session opened with ?debug has the developer hooks (__cc.autopilot, skip, timeUp, the TUNE panel), so nothing it
// drives belongs on the online boards: its laps and Daily Challenge runs stay on the device, unsent.
// (Read once, as the page loads: the flag is the address's, and a link inside the game keeps ?debug along.)

/** Whether this page was opened with ?debug. */
export const debugSession: boolean = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
